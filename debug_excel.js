const XLSX = require('xlsx');
const fs = require('fs');

// Script de diagnostic pour analyser un fichier Excel
function analyzeExcelFile(filePath) {
  try {
    console.log('📊 Analyzing Excel file:', filePath);
    
    // Lire le fichier Excel
    const workbook = XLSX.readFile(filePath);
    console.log('📋 Sheets found:', workbook.SheetNames);
    
    // Analyser la première feuille
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    console.log(`📄 Analyzing sheet: ${sheetName}`);
    
    // Convertir en JSON avec headers
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log('📊 File structure:');
    console.log(`   Total rows: ${jsonData.length}`);
    console.log(`   Data rows: ${jsonData.length - 1} (excluding header)`);
    console.log(`   Headers: ${jsonData[0]?.length} columns`);
    
    // Afficher les headers
    console.log('\n📝 Column headers:');
    jsonData[0]?.forEach((header, index) => {
      console.log(`   ${index}: "${header}"`);
    });
    
    // Analyser quelques lignes de données
    console.log('\n🔍 Sample data rows:');
    for (let i = 1; i <= Math.min(5, jsonData.length - 1); i++) {
      console.log(`   Row ${i}:`, jsonData[i]?.slice(0, 5), '...');
    }
    
    // Détecter les colonnes d'email
    console.log('\n📧 Email column detection:');
    const headers = jsonData[0] || [];
    const emailColumns = [];
    headers.forEach((header, index) => {
      if (header && typeof header === 'string') {
        const headerLower = header.toLowerCase();
        if (headerLower.includes('email') || headerLower.includes('mail') || headerLower.includes('courriel')) {
          emailColumns.push({ index, name: header });
        }
      }
    });
    
    if (emailColumns.length > 0) {
      console.log('   Found email columns:');
      emailColumns.forEach(col => {
        console.log(`     Column ${col.index}: "${col.name}"`);
        // Montrer quelques exemples d'emails
        for (let i = 1; i <= Math.min(3, jsonData.length - 1); i++) {
          const emailValue = jsonData[i]?.[col.index];
          if (emailValue) {
            console.log(`       Row ${i}: ${emailValue}`);
          }
        }
      });
    } else {
      console.log('   No email columns detected by name');
      console.log('   Checking for @ symbols in data...');
      
      // Chercher des @ dans les données
      for (let colIndex = 0; colIndex < headers.length; colIndex++) {
        const samplesWithAt = [];
        for (let rowIndex = 1; rowIndex <= Math.min(10, jsonData.length - 1); rowIndex++) {
          const cellValue = jsonData[rowIndex]?.[colIndex];
          if (cellValue && typeof cellValue === 'string' && cellValue.includes('@')) {
            samplesWithAt.push({ row: rowIndex, value: cellValue });
          }
        }
        
        if (samplesWithAt.length > 0) {
          console.log(`     Column ${colIndex} ("${headers[colIndex]}"): contains @ symbols`);
          samplesWithAt.slice(0, 3).forEach(sample => {
            console.log(`       Row ${sample.row}: ${sample.value}`);
          });
        }
      }
    }
    
    // Convertir en format CSV pour voir le résultat final
    console.log('\n📄 CSV conversion sample (first 500 chars):');
    const csvFormat = [
      headers.join(','),
      ...jsonData.slice(1, 4).map(row => row.map(cell => `"${cell || ''}"`).join(','))
    ].join('\n');
    console.log(csvFormat.substring(0, 500));
    
  } catch (error) {
    console.error('❌ Error analyzing file:', error);
  }
}

// Utilisation
if (process.argv.length > 2) {
  const filePath = process.argv[2];
  analyzeExcelFile(filePath);
} else {
  console.log('Usage: node debug_excel.js <path_to_excel_file>');
  console.log('Example: node debug_excel.js "D ASS BASE CONTACTS TEST28072025.xlsx"');
}

module.exports = { analyzeExcelFile };
