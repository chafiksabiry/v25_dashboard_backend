const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();

// Configuration multer pour l'upload de fichiers
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

/**
 * Endpoint pour traiter les fichiers avec OpenAI (avec pagination)
 * POST /api/file-processing/process
 */
router.post('/process', upload.single('file'), async (req, res) => {
  // Set long timeout for file processing
  req.setTimeout(300000); // 5 minutes
  res.setTimeout(300000); // 5 minutes
  
  // Set headers to prevent proxy timeouts
  res.set({
    'Connection': 'keep-alive',
    'Keep-Alive': 'timeout=300',
    'X-Accel-Buffering': 'no' // Disable nginx buffering
  });
  
  try {
    const file = req.file;

    console.log('📁 Processing file:', file?.originalname);

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Traiter le fichier selon son type
    let fileContent = '';
    let fileType = '';
    
    const fileExtension = file.originalname.toLowerCase().split('.').pop();
    
    if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      fileType = 'Excel';
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convertir en JSON avec headers
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      // Debug: Log the structure
      console.log('📊 Excel file structure:');
      console.log('Headers:', jsonData[0]);
      console.log('First data row:', jsonData[1]);
      console.log('Total rows:', jsonData.length);
      
      // Convertir en format CSV pour OpenAI
      const headers = jsonData[0];
      const dataRows = jsonData.slice(1);
      
      const csvFormat = [
        headers.join(','),
        ...dataRows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
      ].join('\n');
      
      fileContent = csvFormat;
      
      // Debug: Log first few lines of CSV
      console.log('📝 CSV format (first 500 chars):', csvFormat.substring(0, 500));
    } else if (fileExtension === 'csv') {
      fileType = 'CSV';
      fileContent = file.buffer.toString('utf8');
    } else if (fileExtension === 'json') {
      fileType = 'JSON';
      fileContent = file.buffer.toString('utf8');
    } else if (fileExtension === 'txt') {
      fileType = 'Text';
      fileContent = file.buffer.toString('utf8');
    } else {
      fileType = 'Unknown';
      fileContent = file.buffer.toString('utf8');
    }

    // Nettoyer le contenu du fichier
    const cleanedFileContent = cleanEmailAddresses(fileContent);
    
    // Send initial response to keep connection alive
    console.log('🚀 Starting file processing...');
    
    // Traiter avec OpenAI
    const result = await processFileWithOpenAI(cleanedFileContent, fileType);
    
    console.log('✅ File processing completed successfully');
    
    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error processing file'
    });
  }
});

/**
 * Fonction pour nettoyer les adresses email
 */
function cleanEmailAddresses(content) {
  const lines = content.split('\n');
  const cleanedLines = lines.map((line, index) => {
    if (index === 0) {
      return line; // Header row
    }
    
    const columns = line.split(',');
    if (columns.length >= 24) {
      const emailColumn = columns[23];
      if (emailColumn && emailColumn.includes('@')) {
        const cleanedEmail = emailColumn.replace(/^Nor\s+/, '').trim();
        columns[23] = cleanedEmail;
      }
    }
    
    return columns.join(',');
  });
  
  const cleanedContent = cleanedLines.join('\n');
  const generalCleaned = cleanedContent.replace(/Nor\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '$1');
  const finalCleaned = generalCleaned.replace(/(?:Prefix|Label|Tag)\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '$1');
  
  return finalCleaned;
}

/**
 * Fonction pour traiter le fichier avec OpenAI
 */
async function processFileWithOpenAI(fileContent, fileType) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  if (!openaiApiKey.startsWith('sk-')) {
    throw new Error('Invalid OpenAI API key format');
  }

  const lines = fileContent.split('\n');
  const maxContentLength = 25000;
  
  // Pour les gros fichiers, utiliser le chunking
  if (fileContent.length > 100000 || lines.length > 200) {
    console.log('🔄 Large file detected, using chunking approach');
    console.log(`📏 Content length: ${fileContent.length} characters`);
    console.log(`📊 Total lines: ${lines.length} (${lines.length - 1} data rows)`);
    return await processLargeFileInChunks(fileContent, fileType, lines);
  }
  
  // Pour les fichiers plus petits, traitement direct
  const truncatedContent = fileContent.length > maxContentLength 
    ? fileContent.substring(0, maxContentLength) + '\n... [content truncated due to size]'
    : fileContent;

  // Count actual data rows (excluding header)
  const dataRowCount = lines.length - 1;
  
  const prompt = `You must process EXACTLY ${dataRowCount} data rows and return EXACTLY ${dataRowCount} lead objects in JSON format.

CRITICAL: You MUST process ALL ${dataRowCount} rows. Do not skip any rows. Do not stop early.

Expected output structure:
{
  "leads": [
    // EXACTLY ${dataRowCount} objects here
    {
      "Deal_Name": "FIRST_NAME LAST_NAME",
      "Email_1": "REAL_EMAIL_FROM_DATA",
      "Phone": "REAL_PHONE_FROM_DATA",
      "Stage": "New",
      "Pipeline": "Sales Pipeline"
    }
  ]
}

MANDATORY PROCESSING RULES:
1. Process ALL ${dataRowCount} data rows (skip only the header row)
2. Extract REAL email from "Email" column (last column)
3. Extract REAL phone from "Téléphone 1" column  
4. Extract REAL names from "Prénom" and "Nom" columns
5. Combine Prénom + Nom for Deal_Name
6. If email missing: use "no-email@placeholder.com"
7. If phone missing: use empty string ""
8. Return EXACTLY ${dataRowCount} lead objects

COLUMN MAPPING FOR THIS FILE:
- Column "Prénom" (index 6) → Deal_Name (first part)
- Column "Nom" (index 7) → Deal_Name (second part)  
- Column "Téléphone 1" (index 19) → Phone
- Column "Email" (index 23) → Email_1

VERIFICATION: Your response must contain exactly ${dataRowCount} lead objects. Count them before responding.

Data to process (${dataRowCount} rows expected):
${truncatedContent}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a data processing expert. Return ONLY valid JSON. Never return text explanations.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    let errorMessage = `OpenAI API error: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage += ` - ${errorData.error.message || errorData.error.type || 'Unknown error'}`;
      }
    } catch (e) {
      // Si on ne peut pas parser l'erreur, utiliser le status text
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  // Parser la réponse JSON
  let parsedData;
  try {
    parsedData = JSON.parse(content);
  } catch (parseError) {
    // Essayer de récupérer un JSON incomplet
    const recoveredData = tryRecoverIncompleteJSON(content, lines.length - 1);
    if (recoveredData) {
      parsedData = recoveredData;
    } else {
      throw new Error(`JSON parse error: ${parseError.message}`);
    }
  }

  if (!parsedData || !parsedData.leads || !Array.isArray(parsedData.leads)) {
    throw new Error('Invalid response format from OpenAI');
  }

  // Traiter les leads pour s'assurer qu'ils ont les champs requis
  const processedLeads = parsedData.leads.map((lead) => {
    let dealName = '';
    
    const prenom = lead.Prénom || lead.prénom || lead.Prenom || lead.prenom || '';
    const nom = lead.Nom || lead.nom || lead.Name || lead.name || '';
    
    if (prenom || nom) {
      dealName = `${prenom} ${nom}`.trim();
    } else {
      dealName = lead.Deal_Name || 'Unknown Lead';
    }
    
      return {
        Last_Activity_Time: lead.Last_Activity_Time || null,
        Deal_Name: dealName,
        Email_1: lead.Email_1 && lead.Email_1 !== 'email@exemple.com' ? lead.Email_1 : 'no-email@placeholder.com',
        Phone: lead.Phone && lead.Phone !== '+33123456789' ? lead.Phone : '',
        Stage: lead.Stage || 'New',
        Pipeline: lead.Pipeline || 'Sales Pipeline',
        Project_Tags: lead.Project_Tags || [],
        Prénom: prenom,
        Nom: nom
      };
  });

  const totalRows = lines.length - 1;
  console.log(`🔍 Processing verification for single chunk:`);
  console.log(`   Expected leads: ${totalRows}`);
  console.log(`   Received leads: ${processedLeads.length}`);
  
  // Handle missing leads by parsing CSV directly
  if (processedLeads.length < totalRows) {
    const missingLeads = totalRows - processedLeads.length;
    console.warn(`⚠️ OpenAI processed ${processedLeads.length}/${totalRows} leads. Adding ${missingLeads} leads from direct CSV parsing.`);
    
    // Parse missing rows directly from CSV
    for (let i = processedLeads.length; i < totalRows; i++) {
      const rowIndex = i + 1; // +1 because lines[0] is header
      const rowData = lines[rowIndex];
      
      if (rowData) {
        const columns = rowData.split(',').map(col => col.replace(/^"|"$/g, '').trim());
        
        const prenom = columns[6] || '';
        const nom = columns[7] || '';
        const phone = columns[19] || '';
        const email = columns[23] || '';
        
        const dealName = prenom && nom ? `${prenom} ${nom}` : 
                        prenom ? `${prenom} Unknown` :
                        nom ? `Unknown ${nom}` :
                        email || `Lead from row ${rowIndex + 1}`;
        
        processedLeads.push({
          Last_Activity_Time: null,
          Deal_Name: dealName,
          Email_1: email || 'no-email@placeholder.com',
          Phone: phone,
          Stage: "New",
          Pipeline: "Sales Pipeline",
          Project_Tags: [],
          Prénom: prenom,
          Nom: nom,
          _isPlaceholder: true
        });
      }
    }
  }

  const validRows = processedLeads.filter(lead => !lead._isPlaceholder).length;
  const invalidRows = processedLeads.filter(lead => lead._isPlaceholder).length;

  return {
    leads: processedLeads,
    validation: {
      totalRows,
      validRows,
      invalidRows,
      errors: invalidRows > 0 ? [`${invalidRows} leads were parsed directly from CSV due to OpenAI incomplete processing`] : []
    }
  };
}

/**
 * Fonction pour traiter les gros fichiers par chunks
 */
async function processLargeFileInChunks(fileContent, fileType, lines) {
  const maxTokensPerChunk = 8000; // Reduced to ensure better processing
  const estimatedTokensPerLine = 25;
  const optimalChunkSize = Math.min(50, Math.floor(maxTokensPerChunk / estimatedTokensPerLine)); // Reduced chunk size to 50
  
  console.log('🔄 Processing large file in chunks:');
  console.log(`📊 Total lines: ${lines.length} (${lines.length - 1} data rows)`);
  console.log(`📦 Chunk size: ${optimalChunkSize} lines per chunk`);
  console.log(`🧮 Total chunks needed: ${Math.ceil((lines.length - 1) / optimalChunkSize)}`);
  
  const allLeads = [];
  const totalChunks = Math.ceil((lines.length - 1) / optimalChunkSize);
  let processedChunks = 0;
  let failedChunks = 0;
  
  // Traiter les chunks en parallèle (limité à 5 simultanés pour éviter les limites de rate)
  const maxConcurrent = 3; // Reduced to avoid timeouts
  const chunkPromises = [];
  
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const startLine = chunkIndex * optimalChunkSize + 1;
    const endLine = Math.min((chunkIndex + 1) * optimalChunkSize, lines.length - 1);
    
    const chunkLines = [
      lines[0], // Header row
      ...lines.slice(startLine, endLine + 1)
    ];
    
    const chunkPromise = processFileWithOpenAI(chunkLines.join('\n'), fileType);
    chunkPromises.push(chunkPromise);
    
    // Traiter par batch pour éviter de surcharger l'API
    if (chunkPromises.length >= maxConcurrent || chunkIndex === totalChunks - 1) {
      try {
        console.log(`⏳ Processing batch of ${chunkPromises.length} chunks...`);
        const batchResults = await Promise.all(chunkPromises);
        
        for (let i = 0; i < batchResults.length; i++) {
          const result = batchResults[i];
          const currentChunkIndex = chunkIndex - chunkPromises.length + i + 1;
          const expectedLeadsInChunk = Math.min(optimalChunkSize, lines.length - 1 - (currentChunkIndex - 1) * optimalChunkSize);
          
          if (result && result.leads && result.leads.length > 0) {
            console.log(`✅ Chunk ${currentChunkIndex}: ${result.leads.length}/${expectedLeadsInChunk} leads processed`);
            
            // If chunk didn't process all expected leads, parse the missing ones directly
            if (result.leads.length < expectedLeadsInChunk) {
              const missingInChunk = expectedLeadsInChunk - result.leads.length;
              console.warn(`⚠️ Chunk ${currentChunkIndex}: Missing ${missingInChunk} leads, parsing directly from CSV`);
              
              // Parse missing leads from this chunk
              const chunkStartLine = (currentChunkIndex - 1) * optimalChunkSize + 1;
              for (let j = result.leads.length; j < expectedLeadsInChunk; j++) {
                const rowIndex = chunkStartLine + j;
                if (rowIndex < lines.length) {
                  const rowData = lines[rowIndex];
                  const columns = rowData.split(',').map(col => col.replace(/^"|"$/g, '').trim());
                  
                  const prenom = columns[6] || '';
                  const nom = columns[7] || '';
                  const phone = columns[19] || '';
                  const email = columns[23] || '';
                  
                  const dealName = prenom && nom ? `${prenom} ${nom}` : 
                                  prenom ? `${prenom} Unknown` :
                                  nom ? `Unknown ${nom}` :
                                  email || `Lead from row ${rowIndex + 1}`;
                  
                  result.leads.push({
                    Last_Activity_Time: null,
                    Deal_Name: dealName,
                    Email_1: email || 'no-email@placeholder.com',
                    Phone: phone,
                    Stage: "New",
                    Pipeline: "Sales Pipeline",
                    Project_Tags: [],
                    Prénom: prenom,
                    Nom: nom,
                    _isPlaceholder: true
                  });
                }
              }
            }
            
            allLeads.push(...result.leads);
            processedChunks++;
          } else {
            console.log(`❌ Chunk ${currentChunkIndex}: No leads returned, parsing entire chunk from CSV`);
            
            // Parse entire chunk directly from CSV
            const chunkStartLine = (currentChunkIndex - 1) * optimalChunkSize + 1;
            for (let j = 0; j < expectedLeadsInChunk; j++) {
              const rowIndex = chunkStartLine + j;
              if (rowIndex < lines.length) {
                const rowData = lines[rowIndex];
                const columns = rowData.split(',').map(col => col.replace(/^"|"$/g, '').trim());
                
                const prenom = columns[6] || '';
                const nom = columns[7] || '';
                const phone = columns[19] || '';
                const email = columns[23] || '';
                
                const dealName = prenom && nom ? `${prenom} ${nom}` : 
                                prenom ? `${prenom} Unknown` :
                                nom ? `Unknown ${nom}` :
                                email || `Lead from row ${rowIndex + 1}`;
                
                allLeads.push({
                  Last_Activity_Time: null,
                  Deal_Name: dealName,
                  Email_1: email || 'no-email@placeholder.com',
                  Phone: phone,
                  Stage: "New",
                  Pipeline: "Sales Pipeline",
                  Project_Tags: [],
                  Prénom: prenom,
                  Nom: nom,
                  _isPlaceholder: true
                });
              }
            }
            failedChunks++;
          }
        }
        
        console.log(`📈 Progress: ${allLeads.length} total leads collected so far`);
        chunkPromises.length = 0;
        
      } catch (error) {
        console.error(`❌ Error processing batch ending at chunk ${chunkIndex + 1}:`, error);
        failedChunks += chunkPromises.length;
        // Continuer avec le batch suivant au lieu d'échouer complètement
      }
    }
  }
  
  const validLeads = allLeads.filter(lead => !lead._isPlaceholder);
  const invalidLeads = allLeads.filter(lead => lead._isPlaceholder);

  console.log('📊 Final chunking results:');
  console.log(`✅ Successfully processed chunks: ${processedChunks}`);
  console.log(`❌ Failed chunks: ${failedChunks}`);
  console.log(`📈 Total leads collected: ${allLeads.length}`);
  console.log(`✅ Valid leads: ${validLeads.length}`);
  console.log(`⚠️ Invalid/placeholder leads: ${invalidLeads.length}`);
  console.log(`🎯 Expected total rows: ${lines.length - 1}`);

  return {
    leads: allLeads,
    validation: {
      totalRows: lines.length - 1,
      validRows: validLeads.length,
      invalidRows: invalidLeads.length,
      errors: failedChunks > 0 ? [`${failedChunks} chunks failed to process`] : []
    }
  };
}

/**
 * Fonction pour récupérer un JSON incomplet
 */
function tryRecoverIncompleteJSON(content, expectedLeads) {
  try {
    // Méthode 1: Essayer de trouver des objets lead complets
    const leadPattern = /\{[^}]*"userId"[^}]*"Email_1"[^}]*"Phone"[^}]*\}/g;
    const leadMatches = content.match(leadPattern);
    
    if (leadMatches && leadMatches.length > 0) {
      const leadsJson = leadMatches.map(obj => obj.trim()).join(',\n    ');
      const reconstructedJson = `{
  "leads": [
    ${leadsJson}
  ],
  "validation": {
    "totalRows": ${expectedLeads},
    "validRows": ${leadMatches.length},
    "invalidRows": ${Math.max(0, expectedLeads - leadMatches.length)},
    "errors": ["JSON was incomplete but leads were recovered"]
  }
}`;
      
      try {
        return JSON.parse(reconstructedJson);
      } catch (e) {
        // Continue to next method
      }
    }
    
    // Méthode 2: Essayer de corriger les problèmes JSON courants
    let fixedContent = content;
    
    // Supprimer les virgules trailing
    fixedContent = fixedContent.replace(/,(\s*[}\]])/g, '$1');
    
    // Ajouter les accolades/crochets manquants
    const openBraces = (fixedContent.match(/\{/g) || []).length;
    const closeBraces = (fixedContent.match(/\}/g) || []).length;
    const openBrackets = (fixedContent.match(/\[/g) || []).length;
    const closeBrackets = (fixedContent.match(/\]/g) || []).length;
    
    if (openBraces > closeBraces) {
      fixedContent += '}'.repeat(openBraces - closeBraces);
    }
    if (openBrackets > closeBrackets) {
      fixedContent += ']'.repeat(openBrackets - closeBrackets);
    }
    
    try {
      const parsed = JSON.parse(fixedContent);
      if (parsed.leads && Array.isArray(parsed.leads)) {
        return parsed;
      }
    } catch (e) {
      // Continue to next method
    }
    
    return null;
  } catch (error) {
    console.error('Error in JSON recovery:', error);
    return null;
  }
}

/**
 * Nouveau endpoint pour traitement paginé
 * POST /api/file-processing/process-paginated
 */
router.post('/process-paginated', upload.single('file'), async (req, res) => {
  // Timeout plus court pour les petites pages
  req.setTimeout(120000); // 2 minutes
  res.setTimeout(120000); // 2 minutes
  
  try {
    const file = req.file;
    const { page = 1, pageSize = 50 } = req.body;
    
    console.log(`📄 Processing file page ${page} with pageSize ${pageSize}:`, file?.originalname);

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Traiter le fichier selon son type
    let fileContent = '';
    let fileType = '';
    
    if (file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
      fileType = 'excel';
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      fileContent = XLSX.utils.sheet_to_csv(worksheet);
    } else if (file.originalname.endsWith('.csv')) {
      fileType = 'csv';
      fileContent = file.buffer.toString('utf8');
    } else if (file.originalname.endsWith('.json')) {
      fileType = 'json';
      fileContent = file.buffer.toString('utf8');
    } else if (file.originalname.endsWith('.txt')) {
      fileType = 'txt';
      fileContent = file.buffer.toString('utf8');
    } else {
      return res.status(400).json({
        success: false,
        error: 'Unsupported file type. Please upload CSV, Excel, JSON, or TXT files.'
      });
    }

    // Nettoyer les adresses email
    const cleanedFileContent = cleanEmailAddresses(fileContent);
    
    // Pagination du contenu
    const lines = cleanedFileContent.split('\n');
    const headerLine = lines[0];
    const dataLines = lines.slice(1).filter(line => line.trim());
    
    const totalRows = dataLines.length;
    const totalPages = Math.ceil(totalRows / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalRows);
    
    if (startIndex >= totalRows) {
      return res.json({
        success: true,
        data: {
          leads: [],
          pagination: {
            currentPage: page,
            totalPages,
            totalRows,
            pageSize,
            hasNextPage: false,
            hasPreviousPage: page > 1
          }
        }
      });
    }
    
    // Extraire les lignes pour cette page
    const pageLines = dataLines.slice(startIndex, endIndex);
    const pageContent = [headerLine, ...pageLines].join('\n');
    
    console.log(`📊 Page ${page}/${totalPages}: Processing ${pageLines.length} rows (${startIndex + 1}-${endIndex})`);
    
    // Traiter cette page avec OpenAI
    const result = await processFileWithOpenAI(pageContent, fileType);
    
    console.log(`✅ Page ${page} processed: ${result.leads.length} leads extracted`);
    
    res.json({
      success: true,
      data: {
        leads: result.leads,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalRows,
          pageSize: parseInt(pageSize),
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
          processedRows: pageLines.length
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error in paginated processing:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error during paginated processing'
    });
  }
});

module.exports = router;
