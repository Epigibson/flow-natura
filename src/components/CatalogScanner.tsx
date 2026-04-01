import React, { useState } from 'react';
import { PDFDocument } from 'pdf-lib';

interface Product {
  codigo: string;
  nombre: string;
  precio: number;
  puntos?: number;
  categoria?: string;
}

export default function CatalogScanner() {
  const [file, setFile] = useState<File | null>(null);
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [maxPages, setMaxPages] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const count = pdfDoc.getPageCount();
        setMaxPages(count);
        setEndPage(count);
        setStartPage(1);
        addLog(`PDF cargado: ${count} páginas.`);
      } catch (err: any) {
        addLog(`Error cargando PDF: ${err.message}`);
      }
    }
  };

  const addLog = (msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 50));
  };

  const processPages = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProducts([]);
    addLog(`Iniciando extracción (Páginas ${startPage} a ${endPage})`);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      
      let startIdx = Math.max(0, startPage - 1);
      let endIdx = Math.min(maxPages - 1, endPage - 1);
      
      const total = endIdx - startIdx + 1;
      setTotalToProcess(total);
      setCurrentProgress(0);

      const newProducts: Product[] = [];

      for (let i = startIdx; i <= endIdx; i++) {
        setCurrentProgress(i - startIdx + 1);
        addLog(`Procesando página ${i + 1}...`);
        
        try {
          const subPdf = await PDFDocument.create();
          const [copiedPage] = await subPdf.copyPages(pdfDoc, [i]);
          subPdf.addPage(copiedPage);
          const subPdfBytes = await subPdf.save();
          
          const blob = new Blob([subPdfBytes as unknown as BlobPart], { type: 'application/pdf' });
          const formData = new FormData();
          formData.append('file', blob, `page_${i + 1}.pdf`);

          const res = await fetch('/api/process-catalog', {
            method: 'POST',
            body: formData
          });

          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || `HTTP ${res.status}`);
          }

          const data = await res.json();
          if (data.products && data.products.length > 0) {
            newProducts.push(...data.products);
            setProducts([...newProducts]);
            addLog(`Se encontraron ${data.products.length} productos en la pág ${i + 1}.`);
          } else {
            addLog(`Pág ${i + 1}: Sin productos válidos.`);
          }
          
          // Delay to respect rate limits (Gemini Free has 15 RPM, we wait 4s to average 15 RPM)
          await new Promise(r => setTimeout(r, 4000));
          
        } catch (err: any) {
          addLog(`Error en pág ${i + 1}: ${err.message}`);
        }
      }
      
      addLog(`Proceso finalizado. Total extraído: ${newProducts.length} productos.`);
    } catch (err: any) {
      addLog(`Error general: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadCSV = () => {
    if (products.length === 0) return;
    const header = "Codigo,Nombre,Precio,Puntos,Categoria\n";
    const rows = products.map(p => `"${p.codigo}","${p.nombre}",${p.precio},${p.puntos || ''},"${p.categoria || ''}"`).join("\n");
    const csvContent = "data:text/csv;charset=utf-8," + header + rows;
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "productos_natura.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 text-slate-200">
      
      {/* File Configuration Section */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl shadow-xl space-y-4">
        <h2 className="text-xl font-semibold text-white/90">Escaner de Catálogos (PDF a JSON por IA)</h2>
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 space-y-1">
            <label className="text-sm text-slate-400">Seleccionar PDF de Natura</label>
            <input 
              type="file" 
              accept=".pdf"
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-300
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-emerald-600/20 file:text-emerald-400
                hover:file:bg-emerald-600/30 cursor-pointer focus:outline-none"
            />
          </div>
          
          <div className="w-24 space-y-1">
            <label className="text-sm text-slate-400">Pág Incio</label>
            <input 
              type="number" 
              min={1} max={file ? maxPages : 1}
              value={startPage}
              onChange={e => setStartPage(Number(e.target.value))}
              disabled={!file || isProcessing}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none disabled:opacity-50"
            />
          </div>
          
          <div className="w-24 space-y-1">
            <label className="text-sm text-slate-400">Pág Fin</label>
            <input 
              type="number" 
              min={startPage} max={file ? maxPages : 1}
              value={endPage}
              onChange={e => setEndPage(Number(e.target.value))}
              disabled={!file || isProcessing}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          <button
            onClick={processPages}
            disabled={!file || isProcessing}
            className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white font-medium py-2 px-6 rounded transition"
          >
            {isProcessing ? 'Procesando...' : 'Iniciar Escaneo'}
          </button>
        </div>
        
        {isProcessing && (
          <div className="mt-4">
             <div className="flex justify-between text-xs text-slate-400 mb-1">
               <span>Progreso del escaneo...</span>
               <span>{currentProgress} de {totalToProcess} páginas</span>
             </div>
             <div className="w-full bg-slate-800 rounded-full h-2">
               <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${(currentProgress / totalToProcess) * 100}%`}}></div>
             </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Extracted Data Table */}
        <div className="lg:col-span-2 p-6 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col">
          <div className="flex justify-between items-center mb-4">
             <h3 className="font-semibold text-white/90">Productos Extraídos ({products.length})</h3>
             <button
               onClick={downloadCSV}
               disabled={products.length === 0}
               className="text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 px-3 rounded disabled:opacity-50 transition"
             >
               Exportar CSV
             </button>
          </div>
          <div className="overflow-auto border border-slate-800 rounded">
            <table className="w-full text-sm text-left table-auto">
              <thead className="text-xs text-slate-400 bg-slate-950 border-b border-slate-800 sticky top-0">
                <tr>
                  <th className="px-4 py-3 font-medium">CÓDIGO</th>
                  <th className="px-4 py-3 font-medium">NOMBRE</th>
                  <th className="px-4 py-3 font-medium">PRECIO</th>
                  <th className="px-4 py-3 font-medium">PTS</th>
                  <th className="px-4 py-3 font-medium">CATEGORÍA</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No hay productos extraídos.
                    </td>
                  </tr>
                ) : (
                  products.map((p, i) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/50 transition">
                      <td className="px-4 py-3 font-mono text-emerald-400">{p.codigo}</td>
                      <td className="px-4 py-3 text-slate-300">{p.nombre}</td>
                      <td className="px-4 py-3 text-amber-300">${p.precio}</td>
                      <td className="px-4 py-3 text-slate-400">{p.puntos || '-'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{p.categoria || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Console / Logs */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl shadow-xl flex flex-col">
           <h3 className="font-semibold text-white/90 mb-4">Registro de Sistema</h3>
           <div className="flex-1 bg-slate-950 rounded border border-slate-800 p-4 font-mono text-xs overflow-y-auto max-h-[500px]">
             {logs.length === 0 ? (
                <span className="text-slate-600">Esperando archivo...</span>
             ) : (
                logs.map((log, i) => (
                  <div key={i} className="text-slate-400 border-b border-slate-900 py-1">{log}</div>
                ))
             )}
           </div>
        </div>
      </div>
    </div>
  );
}
