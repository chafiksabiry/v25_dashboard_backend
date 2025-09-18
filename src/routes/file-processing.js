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
 * Endpoint pour traiter les fichiers avec OpenAI
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
    console.log('📊 File size:', file?.size, 'bytes');
    console.log('🔧 Environment check - NODE_ENV:', process.env.NODE_ENV);

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
  console.log('🔑 Checking OpenAI API key...');
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiApiKey) {
    console.error('❌ OpenAI API key not found in environment variables');
    console.log('Available env vars:', Object.keys(process.env).filter(key => key.includes('OPENAI')));
    throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.');
  }

  if (!openaiApiKey.startsWith('sk-')) {
    console.error('❌ Invalid OpenAI API key format:', openaiApiKey.substring(0, 10) + '...');
    throw new Error('Invalid OpenAI API key format. Key should start with "sk-"');
  }
  
  console.log('✅ OpenAI API key found and valid format');

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
      'Authorization': `Bearer ${openaiApiKey}`,
      'User-Agent': 'FileProcessor/1.0'
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a data processing expert. Return ONLY valid JSON. Never return text explanations. Process ALL rows provided.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 4000, // Increased token limit
      timeout: 40000 // 40 second timeout
    })
  });

  if (!response.ok) {
    let errorMessage = `OpenAI API error: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage += ` - ${errorData.error.message || errorData.error.type || 'Unknown error'}`;
        
        // Handle specific OpenAI errors
        if (errorData.error.type === 'rate_limit_exceeded') {
          throw new Error('OpenAI rate limit exceeded. Please wait and try again.');
        }
        if (errorData.error.type === 'insufficient_quota') {
          throw new Error('OpenAI API quota exceeded. Please check your billing.');
        }
        if (errorData.error.type === 'invalid_request_error') {
          throw new Error(`OpenAI request error: ${errorData.error.message}`);
        }
      }
    } catch (parseError) {
      if (parseError.message.includes('OpenAI')) {
        throw parseError; // Re-throw our custom errors
      }
      // Si on ne peut pas parser l'erreur, utiliser le status text
      console.warn('Could not parse OpenAI error response:', parseError.message);
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

  // Validate leads based on actual data quality, not processing method
  const validRows = processedLeads.filter(lead => {
    const hasName = lead.Deal_Name && lead.Deal_Name !== '' && !lead.Deal_Name.startsWith('Lead from row');
    const hasEmail = lead.Email_1 && lead.Email_1 !== '' && lead.Email_1 !== 'no-email@placeholder.com';
    const hasPhone = lead.Phone && lead.Phone !== '';
    return hasName || hasEmail || hasPhone;
  }).length;
  
  const invalidRows = processedLeads.filter(lead => {
    const hasName = lead.Deal_Name && lead.Deal_Name !== '' && !lead.Deal_Name.startsWith('Lead from row');
    const hasEmail = lead.Email_1 && lead.Email_1 !== '' && lead.Email_1 !== 'no-email@placeholder.com';
    const hasPhone = lead.Phone && lead.Phone !== '';
    return !(hasName || hasEmail || hasPhone);
  }).length;

  // Clean up the _isPlaceholder flag from final results
  const cleanedLeads = processedLeads.map(lead => {
    const { _isPlaceholder, ...cleanLead } = lead;
    return cleanLead;
  });

  return {
    leads: cleanedLeads,
    validation: {
      totalRows,
      validRows,
      invalidRows,
      errors: invalidRows > 0 ? [`${invalidRows} leads have incomplete data`] : []
    }
  };
}

/**
 * Fonction pour traiter les gros fichiers par chunks
 */
async function processLargeFileInChunks(fileContent, fileType, lines) {
  const maxTokensPerChunk = 6000; // Further reduced for reliability
  const estimatedTokensPerLine = 25;
  const optimalChunkSize = Math.min(30, Math.floor(maxTokensPerChunk / estimatedTokensPerLine)); // Reduced chunk size to 30
  
  console.log('🔄 Processing large file in chunks:');
  console.log(`📊 Total lines: ${lines.length} (${lines.length - 1} data rows)`);
  console.log(`📦 Chunk size: ${optimalChunkSize} lines per chunk`);
  console.log(`🧮 Total chunks needed: ${Math.ceil((lines.length - 1) / optimalChunkSize)}`);
  
  const allLeads = [];
  const totalChunks = Math.ceil((lines.length - 1) / optimalChunkSize);
  let processedChunks = 0;
  let failedChunks = 0;
  
  // Process chunks sequentially to avoid rate limiting and timeouts
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const startLine = chunkIndex * optimalChunkSize + 1;
    const endLine = Math.min((chunkIndex + 1) * optimalChunkSize, lines.length - 1);
    const expectedLeadsInChunk = endLine - startLine + 1;
    
    console.log(`⏳ Processing chunk ${chunkIndex + 1}/${totalChunks} (rows ${startLine}-${endLine})...`);
    
    const chunkLines = [
      lines[0], // Header row
      ...lines.slice(startLine, endLine + 1)
    ];
    
    try {
      // Try to process with OpenAI first
      const result = await processChunkWithOpenAI(chunkLines.join('\n'), fileType, expectedLeadsInChunk);
      
      if (result && result.leads && result.leads.length > 0) {
        console.log(`✅ Chunk ${chunkIndex + 1}: ${result.leads.length}/${expectedLeadsInChunk} leads processed via OpenAI`);
        
        // If chunk didn't process all expected leads, parse the missing ones directly
        if (result.leads.length < expectedLeadsInChunk) {
          const missingInChunk = expectedLeadsInChunk - result.leads.length;
          console.warn(`⚠️ Chunk ${chunkIndex + 1}: Missing ${missingInChunk} leads, parsing directly from CSV`);
          
          // Parse missing leads from this chunk
          for (let j = result.leads.length; j < expectedLeadsInChunk; j++) {
            const rowIndex = startLine + j;
            if (rowIndex < lines.length) {
              const directLead = parseLeadFromCSVRow(lines[rowIndex], rowIndex);
              if (directLead) {
                result.leads.push(directLead);
              }
            }
          }
        }
        
        allLeads.push(...result.leads);
        processedChunks++;
      } else {
        throw new Error('No leads returned from OpenAI');
      }
      
    } catch (error) {
      console.warn(`⚠️ Chunk ${chunkIndex + 1} failed with OpenAI (${error.message}), falling back to direct CSV parsing`);
      
      // Fallback: Parse entire chunk directly from CSV
      let successfullyParsed = 0;
      for (let j = 0; j < expectedLeadsInChunk; j++) {
        const rowIndex = startLine + j;
        if (rowIndex < lines.length) {
          const directLead = parseLeadFromCSVRow(lines[rowIndex], rowIndex);
          if (directLead) {
            allLeads.push(directLead);
            successfullyParsed++;
          } else {
            console.warn(`⚠️ Could not parse row ${rowIndex}: "${lines[rowIndex].substring(0, 100)}..."`);
          }
        }
      }
      console.log(`📊 Chunk ${chunkIndex + 1}: ${successfullyParsed}/${expectedLeadsInChunk} leads parsed via CSV fallback`);
      
      // Only count as failed if we couldn't parse any leads from the chunk
      if (successfullyParsed === 0) {
        failedChunks++;
      }
    }
    
    // Add delay between chunks to respect rate limits
    if (chunkIndex < totalChunks - 1) {
      console.log('⏸️ Waiting 2 seconds before next chunk...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Progress update every 10 chunks
    if ((chunkIndex + 1) % 10 === 0 || chunkIndex === totalChunks - 1) {
      console.log(`📈 Progress: ${chunkIndex + 1}/${totalChunks} chunks processed, ${allLeads.length} leads collected`);
    }
  }
  
  // Validate leads based on actual data quality, not processing method
  const validLeads = allLeads.filter(lead => {
    // A lead is valid if it has at least a name or email
    const hasName = lead.Deal_Name && lead.Deal_Name !== '' && !lead.Deal_Name.startsWith('Lead from row');
    const hasEmail = lead.Email_1 && lead.Email_1 !== '' && lead.Email_1 !== 'no-email@placeholder.com';
    const hasPhone = lead.Phone && lead.Phone !== '';
    
    return hasName || hasEmail || hasPhone;
  });
  
  const invalidLeads = allLeads.filter(lead => {
    const hasName = lead.Deal_Name && lead.Deal_Name !== '' && !lead.Deal_Name.startsWith('Lead from row');
    const hasEmail = lead.Email_1 && lead.Email_1 !== '' && lead.Email_1 !== 'no-email@placeholder.com';
    const hasPhone = lead.Phone && lead.Phone !== '';
    
    return !(hasName || hasEmail || hasPhone);
  });

  console.log('📊 Final chunking results:');
  console.log(`✅ Successfully processed chunks: ${processedChunks}`);
  console.log(`❌ Failed chunks: ${failedChunks}`);
  console.log(`📈 Total leads collected: ${allLeads.length}`);
  console.log(`✅ Valid leads (with data): ${validLeads.length}`);
  console.log(`⚠️ Invalid leads (no data): ${invalidLeads.length}`);
  console.log(`🎯 Expected total rows: ${lines.length - 1}`);

  // Clean up the _isPlaceholder flag from final results
  const cleanedLeads = allLeads.map(lead => {
    const { _isPlaceholder, ...cleanLead } = lead;
    return cleanLead;
  });

  return {
    leads: cleanedLeads,
    validation: {
      totalRows: lines.length - 1,
      validRows: validLeads.length,
      invalidRows: invalidLeads.length,
      errors: failedChunks > 0 ? [`${failedChunks} chunks failed to process`] : []
    }
  };
}

/**
 * Fonction pour traiter un chunk avec OpenAI avec timeout et retry
 */
async function processChunkWithOpenAI(chunkContent, fileType, expectedLeads, retryCount = 0) {
  const maxRetries = 2;
  const timeout = 45000; // 45 seconds timeout
  
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI request timeout')), timeout);
    });
    
    const processPromise = processFileWithOpenAI(chunkContent, fileType);
    
    const result = await Promise.race([processPromise, timeoutPromise]);
    return result;
    
  } catch (error) {
    console.warn(`Chunk processing attempt ${retryCount + 1} failed: ${error.message}`);
    
    if (retryCount < maxRetries && (error.message.includes('timeout') || error.message.includes('rate limit'))) {
      console.log(`Retrying chunk in ${(retryCount + 1) * 3} seconds...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 3000));
      return await processChunkWithOpenAI(chunkContent, fileType, expectedLeads, retryCount + 1);
    }
    
    throw error;
  }
}

/**
 * Fonction pour parser une ligne CSV directement
 */
function parseLeadFromCSVRow(rowData, rowIndex) {
  try {
    if (!rowData || rowData.trim() === '') {
      console.warn(`Row ${rowIndex} is empty or whitespace only`);
      return null;
    }
    
    // Parse CSV row with proper handling of quoted fields and escaped quotes
    const columns = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < rowData.length) {
      const char = rowData[i];
      
      if (char === '"') {
        // Check for escaped quotes ("")
        if (inQuotes && i + 1 < rowData.length && rowData[i + 1] === '"') {
          current += '"';
          i += 2; // Skip both quotes
          continue;
        }
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        columns.push(current.trim());
        current = '';
      } else {
        current += char;
      }
      i++;
    }
    columns.push(current.trim()); // Add the last column
    
    // Clean up quoted fields
    const cleanedColumns = columns.map(col => col.replace(/^"|"$/g, '').trim());
    
    // Ensure we have enough columns
    if (cleanedColumns.length < 24) {
      console.warn(`Row ${rowIndex}: Only ${cleanedColumns.length} columns found, expected at least 24`);
      // Pad with empty strings
      while (cleanedColumns.length < 24) {
        cleanedColumns.push('');
      }
    }
    
    // Extract data from known column positions (adjust if needed)
    const prenom = cleanedColumns[6] || '';
    const nom = cleanedColumns[7] || '';
    const phone = cleanedColumns[19] || '';
    const email = cleanedColumns[23] || '';
    
    // Additional fallback: try to find email in other columns if not in position 23
    let finalEmail = email;
    if (!email || email === '') {
      for (let col of cleanedColumns) {
        if (col.includes('@') && col.includes('.')) {
          finalEmail = col;
          break;
        }
      }
    }
    
    // Create deal name
    const dealName = prenom && nom ? `${prenom} ${nom}` : 
                    prenom ? `${prenom} Unknown` :
                    nom ? `Unknown ${nom}` :
                    finalEmail || `Lead from row ${rowIndex + 1}`;
    
    const lead = {
      Last_Activity_Time: null,
      Deal_Name: dealName,
      Email_1: finalEmail || 'no-email@placeholder.com',
      Phone: phone,
      Stage: "New",
      Pipeline: "Sales Pipeline",
      Project_Tags: [],
      Prénom: prenom,
      Nom: nom,
      _isPlaceholder: true // Mark as placeholder since it wasn't processed by OpenAI
    };
    
    return lead;
    
  } catch (error) {
    console.error(`Error parsing CSV row ${rowIndex}:`, error);
    console.error(`Row content: "${rowData.substring(0, 200)}..."`);
    return null;
  }
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

module.exports = router;
