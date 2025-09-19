const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();

/**
 * Endpoint de test pour vérifier la communication frontend-backend
 * GET /api/file-processing/test
 */
router.get('/test', (req, res) => {
  console.log('🔍 Test endpoint called');
  res.json({
    success: true,
    message: 'File processing API is working',
    timestamp: new Date().toISOString(),
    server: 'Backend v25_dashboard_backend'
  });
});

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
  
  // Set headers to prevent proxy timeouts and improve frontend communication
  res.set({
    'Connection': 'keep-alive',
    'Keep-Alive': 'timeout=300',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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
    
    // Log progression pour debugging frontend
    console.log('🚀 Starting file processing...');
    console.log('📊 File info:', {
      name: file.originalname,
      size: file.size,
      type: fileType,
      contentLength: cleanedFileContent.length
    });
    
    // Traiter avec OpenAI
    const startTime = Date.now();
    console.log('⏱️ Processing started at:', new Date().toISOString());
    
    const result = await processFileWithOpenAI(cleanedFileContent, fileType);
    
    const processingTime = (Date.now() - startTime) / 1000;
    console.log('✅ File processing completed successfully');
    console.log('⏱️ Processing time:', processingTime, 'seconds');
    console.log('📊 Result summary:', {
      totalRows: result.validation?.totalRows || 0,
      validRows: result.validation?.validRows || 0,
      invalidRows: result.validation?.invalidRows || 0,
      leadsCount: result.leads?.length || 0
    });
    
    // Ensure proper JSON response
    const response = {
      success: true,
      data: result,
      meta: {
        processingTime: processingTime,
        timestamp: new Date().toISOString(),
        fileInfo: {
          name: file.originalname,
          size: file.size,
          type: fileType
        }
      }
    };
    
    console.log('📤 Sending response to frontend...');
    res.json(response);

  } catch (error) {
    console.error('❌ Error processing file:', error);
    console.error('❌ Error stack:', error.stack);
    
    // Determine error type for better frontend handling
    let errorType = 'unknown';
    let statusCode = 500;
    
    if (error.message?.includes('timeout')) {
      errorType = 'timeout';
      statusCode = 408;
    } else if (error.message?.includes('OpenAI')) {
      errorType = 'openai_error';
      statusCode = 503;
    } else if (error.message?.includes('file')) {
      errorType = 'file_processing_error';
      statusCode = 400;
    }
    
    const errorResponse = {
      success: false,
      error: error.message || 'Error processing file',
      errorType: errorType,
      timestamp: new Date().toISOString()
    };
    
    console.log('📤 Sending error response to frontend:', errorResponse);
    res.status(statusCode).json(errorResponse);
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
  // Cette fonction est maintenant obsolète - redirection vers le parsing CSV direct
  console.log('🔄 Redirecting to direct CSV parsing (OpenAI disabled)');
  const lines = fileContent.split('\n');
  return await processFileDirectlyFromCSV(fileContent, lines);
  
  // Pour les gros fichiers, utiliser le chunking
  if (fileContent.length > 100000 || lines.length > 200) {
    console.log('🔄 Large file detected, using chunking approach');
    console.log(`📏 Content length: ${fileContent.length} characters`);
    console.log(`📊 Total lines: ${lines.length} (${lines.length - 1} data rows)`);
    
    // Always use direct CSV parsing - OpenAI disabled to save quota and improve reliability
    console.log('🚀 Using direct CSV parsing (OpenAI disabled to save quota and improve reliability)');
    return await processFileDirectlyFromCSV(fileContent, lines);
    
    return await processLargeFileInChunks(fileContent, fileType, lines);
  }
  
  // Pour tous les fichiers (petits et grands), utiliser le parsing CSV direct
  console.log('🚀 Using direct CSV parsing (OpenAI permanently disabled)');
  return await processFileDirectlyFromCSV(fileContent, lines);
}

/**
 * Fonction pour traiter directement via CSV sans OpenAI - Version optimisée avec détection automatique
 */
async function processFileDirectlyFromCSV(fileContent, lines) {
  console.log('🔄 Processing file directly from CSV (bypassing OpenAI)');
  console.log(`📊 Total lines: ${lines.length} (${lines.length - 1} data rows)`);
  
  // Detect column structure automatically from header using OpenAI + fallback
  console.log('🔍 Analyzing header structure with AI assistance...');
  // Détecter la structure des colonnes avec header + optionnellement ligne de données
  const sampleDataLine = lines.length > 1 ? lines[1] : null;
  console.log('📊 Analyzing structure with:', { 
    header: lines[0].substring(0, 100) + '...', 
    sampleData: sampleDataLine ? sampleDataLine.substring(0, 100) + '...' : 'none'
  });
  
  const columnMapping = await detectColumnStructure(lines[0], sampleDataLine);
  console.log('🎯 Final column structure:', columnMapping);
  
  const allLeads = [];
  const totalRows = lines.length - 1;
  
  // Dynamic batch size based on file size for optimal performance
  let batchSize;
  if (totalRows < 5000) {
    batchSize = 500;   // Small files: 500 rows per batch
  } else if (totalRows < 20000) {
    batchSize = 1000;  // Medium files: 1000 rows per batch
  } else if (totalRows < 50000) {
    batchSize = 2000;  // Large files: 2000 rows per batch
  } else {
    batchSize = 5000;  // Very large files: 5000 rows per batch
  }
  
  const totalBatches = Math.ceil(totalRows / batchSize);
  
  console.log(`🚀 Processing in batches of ${batchSize} rows (${totalBatches} batches total)`);
  
  // Process in batches for better performance
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const startIndex = batchIndex * batchSize + 1; // +1 to skip header
    const endIndex = Math.min(startIndex + batchSize, lines.length);
    const batchLeads = [];
    
    // Process batch synchronously for maximum speed
    for (let i = startIndex; i < endIndex; i++) {
      const lead = parseLeadFromCSVRowDynamic(lines[i], i, columnMapping);
      if (lead) {
        batchLeads.push(lead);
      }
    }
    
    allLeads.push(...batchLeads);
    
    // Progress feedback every 5 batches or on last batch
    if ((batchIndex + 1) % 5 === 0 || batchIndex === totalBatches - 1) {
      const processed = Math.min((batchIndex + 1) * batchSize, totalRows);
      console.log(`📈 Progress: ${processed}/${totalRows} rows processed (${Math.round((processed/totalRows) * 100)}%)`);
    }
    
    // Small yield to prevent blocking for very large files
    if (batchIndex % 10 === 0 && batchIndex > 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  
  // Fast validation using optimized filtering
  const { validLeads, invalidLeads } = validateLeadsOptimized(allLeads);
  
  console.log('📊 Direct CSV processing results:');
  console.log(`📈 Total leads processed: ${allLeads.length}`);
  console.log(`✅ Valid leads: ${validLeads.length}`);
  console.log(`⚠️ Invalid leads: ${invalidLeads.length}`);
  console.log(`🎯 Expected total rows: ${totalRows}`);
  
  return {
    leads: allLeads,
    validation: {
      totalRows,
      validRows: validLeads.length,
      invalidRows: invalidLeads.length,
      errors: invalidLeads.length > 0 ? [`${invalidLeads.length} leads have incomplete data`] : []
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
 * Fonction pour traiter un chunk directement en CSV (OpenAI désactivé)
 */
async function processChunkWithOpenAI(chunkContent, fileType, expectedLeads, retryCount = 0) {
  // Cette fonction ne fait plus appel à OpenAI - parsing CSV direct
  console.log('🔄 Processing chunk with direct CSV parsing (OpenAI disabled)');
  const lines = chunkContent.split('\n');
  return await processFileDirectlyFromCSV(chunkContent, lines);
}

/**
 * Fonction pour analyser la structure avec OpenAI (première ligne seulement)
 */
async function analyzeStructureWithOpenAI(headerLine, sampleDataLine = null) {
  console.log('🤖 Using OpenAI to analyze file structure...');
  
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiApiKey) {
    console.warn('⚠️ OpenAI API key not found, using basic fallback');
    return createBasicMapping(headerLine);
  }

  if (!openaiApiKey.startsWith('sk-')) {
    console.warn('⚠️ Invalid OpenAI API key format, using basic fallback');
    return createBasicMapping(headerLine);
  }

  try {
    let dataAnalysis = '';
    if (sampleDataLine) {
      dataAnalysis = `
SAMPLE DATA LINE: ${sampleDataLine}

Use this data sample to confirm your column mapping and understand the actual data format.`;
    }

    const prompt = `You are an expert data analyst. Analyze this CSV file structure to create a perfect column mapping.

HEADER LINE: ${headerLine}${dataAnalysis}

Your task is to intelligently map each column to standard lead/contact fields by analyzing the column names and understanding the data structure.

MAPPING FIELDS TO DETECT:
- email: Email addresses (Email, Mail, E-mail, etc.)
- phone: Phone numbers (Phone, Téléphone, Tel, Mobile, etc.)
- leadName: Main contact name (Lead_Name, Deal_Name, Contact_Name, Name, Nom, etc.)
- firstName: First name (Prénom, FirstName, First, etc.)
- lastName: Last name (Nom, LastName, Last, etc.)
- stage: Status/Stage (Stage, Statut, Status, Étape, etc.)
- pipeline: Pipeline/Source (Pipeline, Source, Canal, etc.)
- projectTag: Tags/Categories (Project_Tag, Tag, Project, Category, etc.)
- accountName: Account/Company (Account_Name, Company, Société, etc.)
- contactName: Contact person (Contact_Name, Contact, etc.)
- amount: Monetary amount (Amount, Montant, Price, etc.)
- probability: Probability percentage (Probability, Probabilité, %, etc.)

ANALYSIS RULES:
1. Column indices start at 0 (first column = 0, second = 1, etc.)
2. Use -1 if a field type cannot be found
3. Be intelligent about variations: "Lead_Name" = leadName, "Email" = email, etc.
4. Look for the most logical mapping based on typical CRM/contact data structure
5. If multiple columns could match, choose the most appropriate one

Return ONLY this JSON structure:
{
  "mapping": {
    "email": column_index_or_-1,
    "phone": column_index_or_-1,
    "firstName": column_index_or_-1,
    "lastName": column_index_or_-1,
    "leadName": column_index_or_-1,
    "accountName": column_index_or_-1,
    "contactName": column_index_or_-1,
    "stage": column_index_or_-1,
    "pipeline": column_index_or_-1,
    "projectTag": column_index_or_-1,
    "amount": column_index_or_-1,
    "probability": column_index_or_-1
  },
  "columns": ["exact_column_names_from_header"],
  "confidence": "high|medium|low"
}`;

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
            content: 'You are a data structure analyzer. Return ONLY valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      console.warn('⚠️ OpenAI API error, using basic fallback');
      return createBasicMapping(headerLine);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      console.warn('⚠️ No response from OpenAI, using basic fallback');
      return createBasicMapping(headerLine);
    }

    const parsed = JSON.parse(content);
    
    if (parsed.mapping && parsed.columns) {
      console.log('✅ OpenAI successfully analyzed structure:');
      console.log('📋 Detected columns:', parsed.columns);
      console.log('🎯 AI-generated mapping:', parsed.mapping);
      console.log('🎯 Confidence level:', parsed.confidence || 'unknown');
      
      // Debug spécifique pour votre nouveau format
      console.log('🔍 CRITICAL MAPPING ANALYSIS:');
      console.log(`  Column ${parsed.mapping.leadName}: "${parsed.columns[parsed.mapping.leadName]}" → leadName`);
      console.log(`  Column ${parsed.mapping.dealName}: "${parsed.columns[parsed.mapping.dealName]}" → dealName`);
      console.log(`  Column ${parsed.mapping.email}: "${parsed.columns[parsed.mapping.email]}" → email`);
      console.log(`  Column ${parsed.mapping.phone}: "${parsed.columns[parsed.mapping.phone]}" → phone`);
      
      // Vérification critique : Deal_Name devrait être mappé à leadName ou dealName
      const dealNameColumnIndex = parsed.columns.findIndex(col => col && col.toLowerCase().includes('deal_name'));
      if (dealNameColumnIndex !== -1) {
        console.log(`🚨 FOUND "Deal_Name" at column ${dealNameColumnIndex}, but OpenAI mapped:`);
        console.log(`   leadName to column ${parsed.mapping.leadName}`);
        console.log(`   dealName to column ${parsed.mapping.dealName}`);
        
        if (parsed.mapping.leadName !== dealNameColumnIndex && parsed.mapping.dealName !== dealNameColumnIndex) {
          console.log('🔧 CORRECTING: Forcing Deal_Name column to be used for leadName');
          parsed.mapping.leadName = dealNameColumnIndex;
        }
      }
      
      return parsed.mapping;
    } else {
      console.warn('⚠️ Invalid OpenAI response format, using basic fallback');
      return createBasicMapping(headerLine);
    }

  } catch (error) {
    console.warn('⚠️ Error with OpenAI analysis:', error.message);
    console.log('🔄 Using basic fallback mapping');
    return createBasicMapping(headerLine);
  }
}

/**
 * Fallback simple si OpenAI échoue complètement
 */
function createBasicMapping(headerLine) {
  console.log('🔧 Creating basic fallback mapping...');
  
  // Parse header line
  const columns = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < headerLine.length; i++) {
    const char = headerLine[i];
    if (char === '"') {
      if (inQuotes && i + 1 < headerLine.length && headerLine[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      columns.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  columns.push(current.trim().replace(/^"|"$/g, ''));
  
  console.log('📋 Basic mapping for columns:', columns);
  
  // Recherche intelligente des colonnes importantes
  const mapping = {
    email: -1,
    phone: -1,
    leadName: -1,
    dealName: -1,
    firstName: -1,
    lastName: -1,
    accountName: -1,
    contactName: -1,
    stage: -1,
    pipeline: -1,
    projectTag: -1,
    amount: -1,
    probability: -1
  };
  
  // Recherche par nom de colonne
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i].toLowerCase();
    
    if (col.includes('deal_name') || col === 'deal_name') {
      mapping.leadName = i; // Deal_Name → leadName
      console.log(`🎯 Found Deal_Name at column ${i}`);
    } else if (col.includes('email') && mapping.email === -1) {
      mapping.email = i;
    } else if (col.includes('phone') && mapping.phone === -1) {
      mapping.phone = i;
    } else if (col.includes('stage') && mapping.stage === -1) {
      mapping.stage = i;
    } else if (col.includes('pipeline') && mapping.pipeline === -1) {
      mapping.pipeline = i;
    }
  }
  
  console.log('🎯 Basic fallback mapping:', mapping);
  return mapping;
}


/**
 * Fonction pour détecter automatiquement la structure des colonnes avec données optionnelles
 */
async function detectColumnStructure(headerLine, sampleDataLine = null) {
  // Utiliser OpenAI pour analyser la structure (header + optionnellement données)
  return await analyzeStructureWithOpenAI(headerLine, sampleDataLine);
}

/**
 * Fonction pour parser une ligne CSV avec mapping dynamique
 */
function parseLeadFromCSVRowDynamic(rowData, rowIndex, columnMapping) {
  try {
    if (!rowData || rowData.trim() === '' || !columnMapping) {
      return null;
    }
    
    // Parse CSV row
    const columns = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < rowData.length; i++) {
      const char = rowData[i];
      if (char === '"') {
        if (inQuotes && i + 1 < rowData.length && rowData[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        columns.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    columns.push(current.trim().replace(/^"|"$/g, ''));
    
    // Debug: Show raw columns for first few rows
    if (rowIndex <= 3) {
      console.log(`🔍 Row ${rowIndex} - Raw columns (first 6):`, columns.slice(0, 6));
    }
    
    // Détection intelligente du format de données
    const hasPipeData = columns.length <= 6 && columns.some(col => col.includes('|'));
    
    if (hasPipeData && (!columns[2] || columns[2].includes('|'))) {
      // Utiliser le parsing spécialisé pour les données avec pipes
      return parseLeadFromPipeData(columns, rowIndex);
    }
    
    // Extract data using dynamic mapping avec gestion des champs CRM
    const email = columnMapping.email >= 0 ? columns[columnMapping.email] || '' : '';
    const phone = columnMapping.phone >= 0 ? columns[columnMapping.phone] || '' : '';
    const firstName = columnMapping.firstName >= 0 ? columns[columnMapping.firstName] || '' : '';
    const lastName = columnMapping.lastName >= 0 ? columns[columnMapping.lastName] || '' : '';
    const dealName = columnMapping.dealName >= 0 ? columns[columnMapping.dealName] || '' : '';
    const leadName = columnMapping.leadName >= 0 ? columns[columnMapping.leadName] || '' : '';
    const accountName = columnMapping.accountName >= 0 ? columns[columnMapping.accountName] || '' : '';
    const contactName = columnMapping.contactName >= 0 ? columns[columnMapping.contactName] || '' : '';
    const stage = columnMapping.stage >= 0 ? columns[columnMapping.stage] || 'New' : 'New';
    const pipeline = columnMapping.pipeline >= 0 ? columns[columnMapping.pipeline] || 'Sales Pipeline' : 'Sales Pipeline';
    const projectTag = columnMapping.projectTag >= 0 ? columns[columnMapping.projectTag] || '' : '';
    const amount = columnMapping.amount >= 0 ? columns[columnMapping.amount] || '' : '';
    const probability = columnMapping.probability >= 0 ? columns[columnMapping.probability] || '' : '';
    
    // Debug pour les premières lignes
    if (rowIndex <= 3) {
      console.log(`🔍 Row ${rowIndex} - Extracted values:`);
      console.log(`  email: "${email}"`);
      console.log(`  phone: "${phone}"`);
      console.log(`  leadName: "${leadName}"`);
      console.log(`  firstName: "${firstName}"  lastName: "${lastName}"`);
    }
    
    // Construction intelligente du nom final
    let finalDealName = '';
    
    // Priorité 1: Prénom + Nom complets
    if (firstName && lastName) {
      finalDealName = `${firstName} ${lastName}`.trim();
    } 
    // Priorité 2: Lead Name ou Deal Name (selon le mapping OpenAI)
    else if (leadName && leadName !== 'Client' && leadName !== 'Lead' && leadName !== 'Contact') {
      finalDealName = leadName;
    } else if (dealName && dealName !== 'Client' && dealName !== 'Lead' && dealName !== 'Contact') {
      finalDealName = dealName;
    }
    // Priorité 3: Account ou Contact Name
    else if (accountName) {
      finalDealName = accountName;
    } else if (contactName) {
      finalDealName = contactName;
    }
    // Priorité 4: Un seul nom
    else if (firstName) {
      finalDealName = firstName;
    } else if (lastName) {
      finalDealName = lastName;
    }
    // Priorité 5: Email comme fallback
    else if (email && email.includes('@')) {
      finalDealName = email.split('@')[0];
    } 
    // Dernier recours
    else {
      finalDealName = `Lead from row ${rowIndex + 1}`;
    }
    
    if (rowIndex <= 3) {
      console.log(`✅ Final Deal Name: "${finalDealName}"`);
    }
    
    // Debug pour les premières lignes
    if (rowIndex <= 3) {
      console.log(`🔍 Row ${rowIndex} - Deal Name construction:`, {
        firstName: `"${firstName}"`,
        lastName: `"${lastName}"`,
        dealName: `"${dealName}"`,
        leadName: `"${leadName}"`,
        finalDealName: `"${finalDealName}"`
      });
    }
    
    // Clean and validate email
    let finalEmail = email;
    if (!email || !email.includes('@')) {
      // Search for email in any column as fallback
      for (const col of columns) {
        if (col && col.includes('@') && col.includes('.')) {
          finalEmail = col;
          break;
        }
      }
    }
    
    const lead = {
      Last_Activity_Time: null,
      Deal_Name: finalDealName,
      Email_1: finalEmail || 'no-email@placeholder.com',
      Phone: phone,
      Stage: stage,
      Pipeline: pipeline,
      Project_Tags: projectTag ? [projectTag] : [],
      Prénom: firstName,
      Nom: lastName,
      Account_Name: accountName,
      Contact_Name: contactName,
      Amount: amount,
      Probability: probability
    };
    
    return lead;
    
  } catch (error) {
    console.error(`Error parsing CSV row ${rowIndex}:`, error);
    return null;
  }
}

/**
 * Fonction spéciale pour parser les données avec des pipes (|)
 */
function parseLeadFromPipeData(columns, rowIndex) {
  try {
    // Votre structure semble être : Email, Phone, Lead_Name, Stage (avec adresse), Pipeline, Project_Tag
    // Mais les données Stage/Project_Tag contiennent des adresses complètes avec des pipes
    
    const email = columns[0] || '';
    const phone = columns[1] || '';
    const leadName = columns[2] || '';
    let stage = columns[3] || '';
    let pipeline = columns[4] || 'Sales Pipeline';
    let projectTag = columns[5] || '';
    
    // Si le pipeline contient une date, le transformer en description
    if (pipeline && pipeline.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      pipeline = `Created on ${pipeline}`;
    }
    
    // Clean stage data - extraire juste la ville/région de l'adresse
    let cleanedStage = 'New';
    if (stage && stage.includes('|')) {
      // Essayer d'extraire la dernière partie qui semble être la région
      const stageParts = stage.split('|');
      const lastPart = stageParts[stageParts.length - 1];
      if (lastPart && lastPart.length > 0) {
        cleanedStage = lastPart.trim();
      }
    } else if (stage) {
      cleanedStage = stage;
    }
    
    // Clean project tag - garder juste une partie pertinente
    let cleanedProjectTag = '';
    if (projectTag && projectTag.includes('|')) {
      // Prendre les premières parties significatives
      const tagParts = projectTag.split('|');
      const significantParts = tagParts.filter(part => part && part.length > 0 && !part.match(/^\d+$/));
      if (significantParts.length > 0) {
        cleanedProjectTag = significantParts[0].trim();
      }
    } else if (projectTag) {
      cleanedProjectTag = projectTag;
    }
    
    // Essayer de trouver un email dans les données
    let finalEmail = email;
    if (!email || !email.includes('@')) {
      for (const col of columns) {
        if (col && col.includes('@') && col.includes('.')) {
          finalEmail = col;
          break;
        }
      }
    }
    
    // Essayer d'extraire prénom et nom depuis les colonnes si disponibles
    let extractedFirstName = '';
    let extractedLastName = '';
    
    // Chercher dans les colonnes pour prénom et nom (basé sur votre structure Excel)
    if (columns.length >= 6) {
      extractedFirstName = columns[5] || ''; // Colonne F (Prénom)
    }
    if (columns.length >= 7) {
      extractedLastName = columns[6] || '';  // Colonne G (Nom)
    }
    
    // Debug pour voir les colonnes extraites
    if (rowIndex <= 3) {
      console.log(`🔍 Row ${rowIndex} - Name extraction:`, {
        column5_prenom: columns[5] || 'empty',
        column6_nom: columns[6] || 'empty',
        extractedFirstName: extractedFirstName,
        extractedLastName: extractedLastName,
        allColumns: columns.slice(0, 10)
      });
    }
    
    // Construire un Deal_Name intelligent
    let intelligentDealName = leadName || 'Unknown Lead';
    if (extractedFirstName && extractedLastName) {
      intelligentDealName = `${extractedFirstName} ${extractedLastName}`.trim();
    } else if (extractedFirstName) {
      intelligentDealName = extractedFirstName;
    } else if (extractedLastName) {
      intelligentDealName = extractedLastName;
    }

    const lead = {
      Last_Activity_Time: null,
      Deal_Name: intelligentDealName,
      Email_1: finalEmail || 'no-email@placeholder.com',
      Phone: phone,
      Stage: cleanedStage,
      Pipeline: pipeline,
      Project_Tags: cleanedProjectTag ? [cleanedProjectTag] : [],
      Prénom: extractedFirstName,
      Nom: extractedLastName,
      Account_Name: '',
      Contact_Name: intelligentDealName,
      Amount: '',
      Probability: ''
    };
    
    // Debug pour les premières lignes
    if (rowIndex <= 3) {
      console.log(`🔧 Row ${rowIndex} - Pipe-parsed lead:`, {
        originalStage: stage.substring(0, 100) + '...',
        cleanedStage: cleanedStage,
        originalProjectTag: projectTag.substring(0, 100) + '...',
        cleanedProjectTag: cleanedProjectTag,
        finalDealName: lead.Deal_Name,
        phone: lead.Phone
      });
    }
    
    return lead;
    
  } catch (error) {
    console.error(`Error parsing pipe data for row ${rowIndex}:`, error);
    return null;
  }
}

/**
 * Fonction optimisée pour valider les leads en lot
 */
function validateLeadsOptimized(allLeads) {
  const validLeads = [];
  const invalidLeads = [];
  
  // Single pass validation for better performance
  for (const lead of allLeads) {
    const hasName = lead.Deal_Name && lead.Deal_Name !== '' && !lead.Deal_Name.startsWith('Lead from row');
    const hasEmail = lead.Email_1 && lead.Email_1 !== '' && lead.Email_1 !== 'no-email@placeholder.com';
    const hasPhone = lead.Phone && lead.Phone !== '';
    
    if (hasName || hasEmail || hasPhone) {
      validLeads.push(lead);
    } else {
      invalidLeads.push(lead);
    }
  }
  
  return { validLeads, invalidLeads };
}

/**
 * Fonction pour parser une ligne CSV directement - Version optimisée
 */
function parseLeadFromCSVRowOptimized(rowData, rowIndex) {
  try {
    if (!rowData || rowData.trim() === '') {
      return null;
    }
    
    // Fast CSV parsing - optimized for performance
    const columns = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    // Optimized parsing loop
    while (i < rowData.length) {
      const char = rowData[i];
      
      if (char === '"') {
        if (inQuotes && i + 1 < rowData.length && rowData[i + 1] === '"') {
          current += '"';
          i += 2;
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
    columns.push(current.trim());
    
    // Fast column cleanup - only process what we need
    const cleanedColumns = new Array(Math.max(24, columns.length));
    for (let j = 0; j < columns.length && j < 24; j++) {
      cleanedColumns[j] = columns[j].replace(/^"|"$/g, '').trim();
    }
    
    // Fill remaining with empty strings if needed
    for (let j = columns.length; j < 24; j++) {
      cleanedColumns[j] = '';
    }
    
    // Extract data from known positions
    const prenom = cleanedColumns[6] || '';
    const nom = cleanedColumns[7] || '';
    const phone = cleanedColumns[19] || '';
    let email = cleanedColumns[23] || '';
    
    // Quick email search if not found at position 23
    if (!email) {
      for (let j = 0; j < Math.min(columns.length, 30); j++) {
        const col = cleanedColumns[j];
        if (col && col.includes('@') && col.includes('.')) {
          email = col;
          break;
        }
      }
    }
    
    // Create deal name efficiently
    const dealName = prenom && nom ? `${prenom} ${nom}` : 
                    prenom ? `${prenom} Unknown` :
                    nom ? `Unknown ${nom}` :
                    email || `Lead from row ${rowIndex + 1}`;
    
    return {
      Last_Activity_Time: null,
      Deal_Name: dealName,
      Email_1: email || 'no-email@placeholder.com',
      Phone: phone,
      Stage: "New",
      Pipeline: "Sales Pipeline",
      Project_Tags: [],
      Prénom: prenom,
      Nom: nom
    };
    
  } catch (error) {
    console.error(`Error parsing CSV row ${rowIndex}:`, error);
    return null;
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
