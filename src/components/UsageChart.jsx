import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart3 } from 'lucide-react';

export default function UsageChart({ data = [] }) {
  // Rellenar días vacíos para asegurar continuidad (opcional, dependiente del dataset)
  
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-surface-elevated border border-borders-subtle p-3 rounded-xl shadow-xl">
          <p className="text-xs text-text-muted mb-2 font-medium">
            {format(parseISO(label), "d 'de' MMM", { locale: es })}
          </p>
          {payload.map((entry, index) => (
            <div key={index} className="flex flex-col gap-1">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">{entry.name}</span>
              <span className="text-sm font-bold" style={{ color: entry.color }}>
                {entry.value}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-surface-elevated border border-borders-subtle rounded-xl flex flex-col h-full overflow-hidden p-4">
      <div className="flex items-center gap-2 mb-4 text-text-primary">
        <BarChart3 className="w-4 h-4 text-[#FF007F]" />
        <h3 className="font-semibold text-sm">Ejecuciones de Herramientas IA (30d)</h3>
      </div>
      
      <div className="flex-1 w-full min-h-[250px]">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-xs">
            Sin datos suficientes
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorTools" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#00F0FF" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis 
                dataKey="date" 
                tickFormatter={(tick) => format(parseISO(tick), "d MMM", { locale: es })}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                dy={10}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="tools" 
                name="Herramientas"
                stroke="#00F0FF" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorTools)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
