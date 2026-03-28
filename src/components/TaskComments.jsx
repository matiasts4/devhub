import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bot, User as UserIcon, Loader2, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/context/AuthContext';

export default function TaskComments({ taskId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  const supabase = createClient();

  useEffect(() => {
    if (!taskId) return;
    fetchComments();
    
    const channel = supabase.channel(`public:task_comments:${taskId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments", filter: `task_id=eq.${taskId}` }, () => {
        fetchComments();
      }).subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [taskId]);

  async function fetchComments() {
    setLoading(true);
    const { data } = await supabase.from('task_comments')
      .select('*, auth_users:user_id(email)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    setComments(data || []);
    setLoading(false);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!newComment.trim() || !user) return;
    setSending(true);
    await supabase.from('task_comments').insert({
      task_id: taskId,
      user_id: user.id,
      content: newComment.trim(),
      author_type: 'human'
    });
    setNewComment("");
    setSending(false);
  }

  return (
    <div className="flex flex-col h-full bg-surface-base border-t md:border-l border-borders-subtle mt-4 md:mt-0 p-4">
      <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-accent-primary"></span>
        Comentarios
      </h3>
      
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#30363d transparent' }}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto text-text-muted" /> : comments.length === 0 ? <p className="text-xs text-text-muted text-center italic">No hay comentarios aún</p> : null}
        
        {comments.map(c => (
          <div key={c.id} className={`flex gap-3 text-sm p-3 rounded-lg border ${c.author_type === 'agent' ? 'border-[#F778BA]/30 bg-[#F778BA]/5' : 'border-borders-subtle bg-surface-card'}`}>
            <div className="flex-shrink-0 mt-0.5">
              {c.author_type === 'agent' ? 
                <Bot className="w-5 h-5 text-[#F778BA]" /> : 
                <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-[10px]">
                  {c.auth_users?.email?.substring(0, 1).toUpperCase() || 'U'}
                </div>
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between mb-1">
                <span className="font-semibold text-xs text-text-primary">
                  {c.author_type === 'agent' ? 'Agente (Swarm)' : (c.auth_users?.email?.split('@')[0] || 'Miembro')}
                </span>
                <span className="text-[10px] text-text-muted">{new Date(c.created_at).toLocaleDateString()} {new Date(c.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
              <div className="prose prose-invert prose-sm max-w-none text-text-secondary leading-snug">
                <ReactMarkdown>{c.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="relative">
        <textarea
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder="Escribe un comentario..."
          className="w-full bg-surface-card border border-borders-subtle rounded-lg px-3 py-2 text-xs focus:ring-1 focus:outline-none min-h-[60px] resize-none pr-10"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
        />
        <button 
          type="submit" 
          disabled={!newComment.trim() || sending}
          className="absolute right-2 bottom-2 p-1.5 bg-accent-primary hover:bg-blue-500 rounded-md text-white disabled:opacity-50 transition-all"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </form>
    </div>
  );
}
