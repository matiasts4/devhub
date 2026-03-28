import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, ChevronRight, FileDiff } from 'lucide-react';

export default function DiffViewer({ diffText, onApprove, onReject, title = "Revisión de Cambios (Diff)" }) {
  // Simple diff parser to style added/removed lines
  const parseDiff = (text) => {
    if (!text) return [];
    return text.split('\n').map((line, idx) => {
      let type = 'normal';
      let className = 'text-gray-300';
      
      if (line.startsWith('+') && !line.startsWith('+++')) {
        type = 'added';
        className = 'bg-green-950/30 text-green-400';
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        type = 'removed';
        className = 'bg-red-950/30 text-red-400';
      } else if (line.startsWith('@@')) {
        type = 'header';
        className = 'text-blue-400 font-semibold';
      } else if (line.startsWith('+++') || line.startsWith('---')) {
        type = 'file';
        className = 'text-yellow-400 font-bold';
      }

      return { line, type, className, id: idx };
    });
  };

  const parsedLines = parseDiff(diffText);

  return (
    <Card className="w-full flex flex-col border-slate-700 bg-slate-900 shadow-xl">
      <CardHeader className="border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-2">
          <FileDiff className="w-5 h-5 text-blue-400" />
          <CardTitle className="text-lg font-medium text-slate-100">{title}</CardTitle>
        </div>
      </CardHeader>
      
      <CardContent className="p-0 flex-1 min-h-[300px] max-h-[500px]">
        <ScrollArea className="h-full w-full bg-[#1e1e1e]">
          <div className="p-4 font-mono text-sm leading-relaxed whitespace-pre font-medium">
            {parsedLines.length > 0 ? (
              parsedLines.map((item) => (
                <div key={item.id} className={`px-2 py-0.5 rounded-sm ${item.className}`}>
                  {item.line}
                </div>
              ))
            ) : (
              <div className="text-slate-500 italic text-center py-10">
                No hay cambios / Diff vacío
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      
      <CardFooter className="flex justify-between items-center border-t border-slate-800 pt-4 bg-slate-800/50">
        <div className="text-xs text-slate-400 flex items-center">
          <ChevronRight className="w-3 h-3 mr-1" />
          Revisa el delta antes de fusionar al núcleo principal.
        </div>
        <div className="flex space-x-3 gap-2">
          <Button 
            variant="destructive" 
            onClick={onReject}
            className="flex items-center shadow-lg"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Rechazar al Worker
          </Button>
          <Button 
            variant="default" 
            onClick={onApprove}
            className="flex items-center bg-green-600 hover:bg-green-700 text-white shadow-lg"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Aprobar a Main
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
