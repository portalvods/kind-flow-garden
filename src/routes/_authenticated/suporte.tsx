import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { getMyTickets, createTicket } from '@/lib/tickets.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Plus, Clock, CheckCircle2, Send, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/suporte')({
  component: SupportPage,
});

function SupportPage() {
  const [isCreating, setIsCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  
  const queryClient = useQueryClient();
  const getTicketsFn = useServerFn(getMyTickets);
  const createTicketFn = useServerFn(createTicket);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['my-tickets'],
    queryFn: () => getTicketsFn(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { subject: string; description: string }) => createTicketFn({ data }),
    onSuccess: () => {
      toast.success('Ticket criado com sucesso!');
      setIsCreating(false);
      setSubject('');
      setDescription('');
      queryClient.invalidateQueries({ queryKey: ['my-tickets'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao criar ticket: ' + error.message);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !description) return;
    createMutation.mutate({ subject, description });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'aberto':
        return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Aberto</Badge>;
      case 'em_atendimento':
        return <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/20">Em Atendimento</Badge>;
      case 'concluido':
        return <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20">Concluído</Badge>;
      case 'cancelado':
        return <Badge variant="secondary" className="bg-red-500/10 text-red-500 border-red-500/20">Cancelado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Suporte ao Cliente</h1>
          <p className="text-muted-foreground">Abra um chamado para dúvidas, problemas técnicos ou financeiro.</p>
        </div>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)} className="glow-primary">
            <Plus className="mr-2 h-4 w-4" /> Novo Chamado
          </Button>
        )}
      </div>

      {isCreating ? (
        <Card className="glass-card animate-in fade-in slide-in-from-top-4 duration-300">
          <CardHeader>
            <CardTitle>Abrir Novo Chamado</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Assunto</label>
                <Input 
                  placeholder="Ex: Problema com login, Dúvida sobre renovação..." 
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Descrição do Problema</label>
                <Textarea 
                  placeholder="Descreva detalhadamente o que está acontecendo..." 
                  className="min-h-[150px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending} className="glow-primary">
                  {createMutation.isPending ? 'Enviando...' : 'Criar Chamado'}
                  {!createMutation.isPending && <Send className="ml-2 h-4 w-4" />}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground italic">Carregando chamados...</div>
          ) : tickets?.length === 0 ? (
            <div className="text-center py-20 glass-card rounded-2xl flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center mb-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-display font-semibold">Nenhum chamado aberto</h3>
              <p className="text-muted-foreground mt-2 max-w-sm">
                Você ainda não abriu nenhum chamado de suporte. Clique no botão acima para começar.
              </p>
            </div>
          ) : (
            tickets?.map((ticket: any) => (
              <Link 
                key={ticket.id} 
                to="/suporte/$id" 
                params={{ id: ticket.id }}
                className="block transition-transform hover:scale-[1.01]"
              >
                <Card className="glass-card border-l-4 border-l-primary hover:bg-accent/5">
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{ticket.subject}</h3>
                          {getStatusBadge(ticket.status)}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1">{ticket.description}</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                        </div>
                        <Button size="sm" variant="ghost" className="h-8">Ver Detalhes</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      )}

      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6">
        <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <Info className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1 text-center md:text-left">
          <h4 className="font-semibold">Atendimento via WhatsApp</h4>
          <p className="text-sm text-muted-foreground">
            Sempre que um admin responder ao seu ticket, você receberá uma notificação automática no seu WhatsApp cadastrado.
          </p>
        </div>
      </div>
    </div>
  );
}
