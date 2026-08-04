import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { getTicketDetails, replyTicket, closeTicket } from '@/lib/tickets.functions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Send, CheckCircle2, User, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/suporte/$id')({
  component: TicketDetailsPage,
});

function TicketDetailsPage() {
  const { id } = Route.useParams();
  const [message, setMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const queryClient = useQueryClient();
  const getDetailsFn = useServerFn(getTicketDetails);
  const replyFn = useServerFn(replyTicket);
  const closeFn = useServerFn(closeTicket);

  const { data, isLoading } = useQuery({
    queryKey: ['ticket-details', id],
    queryFn: () => getDetailsFn({ data: id }),
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data?.messages]);

  const replyMutation = useMutation({
    mutationFn: (text: string) => replyFn({ data: { ticketId: id, message: text } }),
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['ticket-details', id] });
    }
  });

  const closeMutation = useMutation({
    mutationFn: () => closeFn({ data: id }),
    onSuccess: () => {
      toast.success('Ticket encerrado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['ticket-details', id] });
    }
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    replyMutation.mutate(message);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'aberto':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Aberto</Badge>;
      case 'em_atendimento':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Em Atendimento</Badge>;
      case 'concluido':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Concluído</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoading) return <div className="text-center py-20 italic text-muted-foreground">Carregando conversa...</div>;

  const { ticket, messages } = data || {};
  const isClosed = ticket?.status === 'concluido';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <Button variant="ghost" asChild size="sm">
          <Link to="/suporte">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Link>
        </Button>
        {!isClosed && (
          <Button variant="outline" size="sm" onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Encerrar Ticket
          </Button>
        )}
      </div>

      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">{ticket?.subject}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Aberto em {new Date(ticket?.created_at).toLocaleString()}</span>
                <span>•</span>
                {getStatusBadge(ticket?.status)}
              </div>
            </div>
          </div>
          <div className="bg-accent/5 rounded-lg p-4 text-sm whitespace-pre-wrap border border-border/40">
            {ticket?.description}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Send className="h-4 w-4" /> Mensagens
        </h3>
        
        <div ref={scrollRef} className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
          {messages?.map((msg: any) => (
            <div 
              key={msg.id} 
              className={`flex ${msg.is_admin ? 'justify-start' : 'justify-end'}`}
            >
              <div className={`max-w-[80%] rounded-2xl p-4 space-y-1 ${
                msg.is_admin 
                  ? 'bg-accent/10 border border-border/40 rounded-tl-none' 
                  : 'bg-primary text-primary-foreground rounded-tr-none'
              }`}>
                <div className="flex items-center gap-2 mb-1 text-xs opacity-70">
                  {msg.is_admin ? (
                    <><ShieldCheck className="h-3 w-3" /> <span>Suporte Oficial</span></>
                  ) : (
                    <><User className="h-3 w-3" /> <span>Você</span></>
                  )}
                  <span>•</span>
                  <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
              </div>
            </div>
          ))}
          {messages?.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm italic">
              Aguardando resposta do suporte...
            </div>
          )}
        </div>
      </div>

      {!isClosed && (
        <form onSubmit={handleSend} className="glass-card rounded-2xl p-4 flex flex-col gap-3">
          <Textarea 
            placeholder="Digite sua resposta..." 
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[100px] bg-transparent border-none focus-visible:ring-0 p-0 resize-none"
          />
          <div className="flex justify-end border-t border-border/40 pt-3">
            <Button type="submit" disabled={replyMutation.isPending || !message.trim()} className="glow-primary">
              {replyMutation.isPending ? 'Enviando...' : 'Enviar Resposta'}
              {!replyMutation.isPending && <Send className="ml-2 h-4 w-4" />}
            </Button>
          </div>
        </form>
      )}

      {isClosed && (
        <div className="bg-accent/10 border border-border/40 rounded-2xl p-8 text-center space-y-2">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
          <h4 className="font-semibold text-lg">Este ticket foi encerrado</h4>
          <p className="text-sm text-muted-foreground">
            Este atendimento foi concluído. Caso precise de mais ajuda, abra um novo chamado.
          </p>
        </div>
      )}
    </div>
  );
}
