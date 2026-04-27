import React, { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';

interface Product {
  codigo: string;
  nombre: string;
  precio: number;
  puntos?: number;
  categoria?: string;
}

const GEMINI_PROMPT = `Escanéa esta página de un catálogo de Natura y extrae todos los productos que encuentres. Un producto válido debe tener al menos un código y un precio.
Devuelve el resultado EXCLUSIVAMENTE como un JSON Array estricto.
Cada objeto del arreglo debe tener exactamente la siguiente estructura (si no hay puntos o categoría, déjalos nulos o asume lo mejor):
{
  "codigo": "string",
  "nombre": "string",
  "precio": 125.50,
  "puntos": 10,
  "categoria": "string"
}
Si el precio en el PDF dice "R$ 125,50" o "$125.50", conviértelo a número flotante 125.50.
En nombre trata de poner la descripción y el tono si es maquillaje.
Si la página no tiene productos legibles con código y precio, devuelve [].
IMPORTANTE: NO incluyas markdown, NO pongas \`\`\`json, SOLO devuelve el arreglo [] crudo.`;

export default function CatalogScanner() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [maxPages, setMaxPages] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(true);
  const [model, setModel] = useState('gemini-2.0-flash');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setFileName(selectedFile.name);
      
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const count = pdfDoc.getPageCount();
        setMaxPages(count);
        setEndPage(count);
        setStartPage(1);
        addLog(`PDF cargado: "${selectedFile.name}" — ${count} páginas detectadas.`);
      } catch (err: any) {
        addLog(`Error cargando PDF: ${err.message}`);
      }
    }
  };

  const addLog = (msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 100));
  };

  const pdfPageToBase64 = async (pdfDoc: any, pageIndex: number): Promise<string> => {
    const subPdf = await PDFDocument.create();
    const [copiedPage] = await subPdf.copyPages(pdfDoc, [pageIndex]);
    subPdf.addPage(copiedPage);
    const subPdfBytes = await subPdf.save();
    
    return new Promise<string>((resolve, reject) => {
      const blob = new Blob([subPdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const callGemini = async (base64Pdf: string, pageNum: number): Promise<Product[]> => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: 'application/pdf',
              data: base64Pdf
            }
          },
          { text: GEMINI_PROMPT }
        ]
      }],
      generationConfig: {
        temperature: 0.1
      }
    };

    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.status === 429) {
        const waitSecs = Math.pow(2, attempt + 1) * 15;
        addLog(`⏳ Pág ${pageNum}: Límite de cuota. Esperando ${waitSecs}s (${attempt + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, waitSecs * 1000));
        continue;
      }

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Gemini API ${res.status}: ${errBody.substring(0, 200)}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      let jsonStr = text.trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.substring(7);
      if (jsonStr.startsWith('```')) jsonStr = jsonStr.substring(3);
      if (jsonStr.endsWith('```')) jsonStr = jsonStr.substring(0, jsonStr.length - 3);
      
      const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (jsonMatch) jsonStr = jsonMatch[0];
      
      return JSON.parse(jsonStr);
    }
    
    throw new Error('Se agotaron los reintentos por límite de cuota.');
  };

  const processPages = async () => {
    if (!file || !apiKey) {
      if (!apiKey) addLog('Error: Necesitas ingresar tu API Key de Gemini.');
      return;
    }
    setIsProcessing(true);
    setProducts([]);
    addLog(`Iniciando extracción (Páginas ${startPage} a ${endPage})`);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      
      const startIdx = Math.max(0, startPage - 1);
      const endIdx = Math.min(maxPages - 1, endPage - 1);
      
      const total = endIdx - startIdx + 1;
      setTotalToProcess(total);
      setCurrentProgress(0);

      const pagePromises = [];

      for (let i = startIdx; i <= endIdx; i++) {
        setCurrentProgress(i - startIdx + 1);
        addLog(`Procesando página ${i + 1}...`);
        
        try {
          const base64 = await pdfPageToBase64(pdfDoc, i);
          addLog(`Pág ${i + 1}: Enviado a Gemini (${(base64.length / 1024).toFixed(0)} KB)`);
          
          const pageProducts = await callGemini(base64, i + 1);
          
          if (pageProducts && pageProducts.length > 0) {
            newProducts.push(...pageProducts);
            setProducts([...newProducts]);
            addLog(`✓ Pág ${i + 1}: ${pageProducts.length} productos extraídos.`);
          } else {
            addLog(`— Pág ${i + 1}: Sin productos válidos.`);
          }
          
          if (i < endIdx) {
            await new Promise(r => setTimeout(r, 2000));
          }
          
        } catch (err: any) {
          addLog(`✗ Error en pág ${i + 1}: ${err.message}`);
        }
      }
      
      addLog(`═══ Proceso finalizado. Total extraído: ${newProducts.length} productos. ═══`);
    } catch (err: any) {
      addLog(`Error general: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadCSV = () => {
    if (products.length === 0) return;
    const header = "Codigo,Nombre,Precio,Puntos,Categoria\n";
    const rows = products.map(p => `"${p.codigo}","${(p.nombre || '').replace(/"/g, '""')}",${p.precio},${p.puntos || ''},"${(p.categoria || '').replace(/"/g, '""')}"`).join("\n");
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "productos_natura.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    if (products.length === 0) return;
    const jsonStr = JSON.stringify(products, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "productos_natura.json");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const progressPercent = totalToProcess > 0 ? (currentProgress / totalToProcess) * 100 : 0;

  return (
    <div className="space-y-6">
      
      {/* API Key Card */}
      {showApiKeyInput && (
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-outline-variant/10">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary">key</span>
            <h3 className="font-bold text-on-surface">Configurar API Key</h3>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 space-y-1.5 w-full">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Google Gemini API Key</label>
              <input 
                type="password"
                placeholder="AIzaSy..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary-container focus:outline-none font-mono"
              />
              <p className="text-xs text-on-surface-variant/70">Obtén tu clave gratis en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-primary hover:underline font-bold">aistudio.google.com/apikey</a></p>
            </div>
            <div className="w-full sm:w-52 space-y-1.5">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Modelo</label>
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary-container focus:outline-none font-bold"
              >
                <option value="gemini-2.0-flash">Gemini 2.0 Flash (1500 RPD gratis)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (20 RPD gratis)</option>
                <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash-Lite (rápido)</option>
              </select>
            </div>
            <button
              onClick={() => { if (apiKey) setShowApiKeyInput(false); }}
              disabled={!apiKey}
              className="shrink-0 bg-primary text-white font-bold py-3 px-6 rounded-xl disabled:opacity-40 hover:scale-[1.02] transition-all shadow-md"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}

      {/* Main Scanner Card */}
      <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-outline-variant/10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary">document_scanner</span>
            </div>
            <div>
              <h3 className="font-bold text-on-surface text-lg">Escaner Inteligente</h3>
              <p className="text-xs text-on-surface-variant">Impulsado por Google Gemini 2.5 Flash</p>
            </div>
          </div>
          {!showApiKeyInput && apiKey && (
            <button onClick={() => setShowApiKeyInput(true)} className="text-xs text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 font-bold">
              <span className="material-symbols-outlined text-sm">key</span>
              Cambiar Key
            </button>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 space-y-1.5 w-full">
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Documento PDF</label>
            <input 
              type="file" 
              accept=".pdf"
              onChange={handleFileChange}
              className="block w-full text-sm text-on-surface
                bg-surface-container-highest rounded-xl cursor-pointer
                file:mr-4 file:py-3 file:px-5
                file:rounded-l-xl file:border-0
                file:text-sm file:font-bold
                file:bg-primary/10 file:text-primary
                hover:file:bg-primary/20 transition-all"
            />
            {fileName && (
              <p className="text-xs text-on-surface-variant">{fileName} • {maxPages} páginas</p>
            )}
          </div>
          
          <div className="w-full md:w-28 space-y-1.5">
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Inicio</label>
            <input 
              type="number" 
              min={1} max={file ? maxPages : 1}
              value={startPage}
              onChange={e => setStartPage(Number(e.target.value))}
              disabled={!file || isProcessing}
              className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary-container focus:outline-none disabled:opacity-50 font-mono"
            />
          </div>
          
          <div className="w-full md:w-28 space-y-1.5">
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Fin</label>
            <input 
              type="number" 
              min={startPage} max={file ? maxPages : 1}
              value={endPage}
              onChange={e => setEndPage(Number(e.target.value))}
              disabled={!file || isProcessing}
              className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary-container focus:outline-none disabled:opacity-50 font-mono"
            />
          </div>

          <button
            onClick={processPages}
            disabled={!file || isProcessing || !apiKey}
            className="w-full md:w-auto shrink-0 flex items-center justify-center gap-2 bg-primary text-white font-bold py-3 px-8 rounded-xl disabled:opacity-40 hover:scale-[1.02] transition-all shadow-md shadow-primary/20"
          >
            {isProcessing ? (
              <>
                <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                Procesando...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg">auto_awesome</span>
                Iniciar Extracción
              </>
            )}
          </button>
        </div>
        
        {/* Progress Bar */}
        {isProcessing && (
          <div className="mt-6 pt-5 border-t border-outline-variant/10">
            <div className="flex justify-between text-xs font-bold text-on-surface-variant mb-2 uppercase tracking-wider">
              <span>Progreso AI</span>
              <span className="text-primary">{currentProgress} de {totalToProcess} páginas</span>
            </div>
            <div className="w-full bg-surface-container-highest rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Data Table */}
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/10 overflow-hidden">
          <div className="flex justify-between items-center p-6 border-b border-outline-variant/10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-secondary text-lg">table_rows</span>
              </div>
              <h3 className="font-bold text-on-surface">
                Productos Extraídos
                <span className="ml-2 px-2.5 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-bold">{products.length}</span>
              </h3>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={downloadJSON}
                disabled={products.length === 0}
                className="text-xs font-bold bg-surface-container-highest hover:bg-surface-container text-on-surface py-2 px-4 rounded-xl disabled:opacity-40 transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                JSON
              </button>
              <button
                onClick={downloadCSV}
                disabled={products.length === 0}
                className="text-xs font-bold bg-primary text-white py-2 px-4 rounded-xl disabled:opacity-40 hover:scale-[1.02] transition-all shadow-sm flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                CSV
              </button>
            </div>
          </div>
          
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-on-surface-variant bg-surface-container-highest/50 sticky top-0">
                <tr>
                  <th className="px-5 py-3.5 font-bold uppercase tracking-wider">Código</th>
                  <th className="px-5 py-3.5 font-bold uppercase tracking-wider">Nombre</th>
                  <th className="px-5 py-3.5 font-bold uppercase tracking-wider">Precio</th>
                  <th className="px-5 py-3.5 font-bold uppercase tracking-wider">Pts</th>
                  <th className="px-5 py-3.5 font-bold uppercase tracking-wider">Categoría</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center justify-center text-on-surface-variant/50 space-y-2">
                        <span className="material-symbols-outlined text-4xl">description</span>
                        <p className="text-sm">Los productos extraídos aparecerán aquí</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  products.map((p, i) => (
                    <tr key={i} className="hover:bg-primary/[0.03] transition-colors">
                      <td className="px-5 py-3.5 font-mono text-primary font-bold text-xs">{p.codigo}</td>
                      <td className="px-5 py-3.5 text-on-surface">{p.nombre}</td>
                      <td className="px-5 py-3.5 text-primary font-display font-bold">${p.precio?.toFixed(2)}</td>
                      <td className="px-5 py-3.5 text-on-surface-variant">
                        <span className="bg-surface-container-highest px-2 py-0.5 rounded-md text-xs font-bold">{p.puntos || '—'}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        {p.categoria ? (
                          <span className="bg-secondary/10 text-secondary px-2.5 py-1 rounded-lg text-xs font-bold">{p.categoria}</span>
                        ) : <span className="text-on-surface-variant/40">—</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Console / Logs */}
        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/10 overflow-hidden flex flex-col">
          <div className="flex items-center gap-3 p-6 border-b border-outline-variant/10">
            <div className="w-9 h-9 rounded-lg bg-tertiary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-tertiary text-lg">terminal</span>
            </div>
            <h3 className="font-bold text-on-surface">Terminal AI</h3>
          </div>
           
          <div className="flex-1 bg-surface-container-highest/30 p-5 font-mono text-xs overflow-y-auto max-h-[500px]">
            {logs.length === 0 ? (
              <div className="flex items-center gap-2 text-on-surface-variant/40 mt-2">
                <span className="animate-pulse">●</span> Esperando inicialización...
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-primary shrink-0">›</span>
                    <span className={i === 0 ? 'text-on-surface font-bold' : 'text-on-surface-variant'}>{log}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
