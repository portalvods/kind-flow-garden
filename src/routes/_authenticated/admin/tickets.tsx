import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { getAllTickets, closeTicket } from '@/lib/tickets.functions';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Clock, CheckCircle2, User, Phone, ExternalLink, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/_authenticated/admin/tickets')({
  component: AdminTicketsPage,
});

function AdminTicketsPage() {
  const [filter, setFilter] = useState<string>('todos');
  const [search, setSearch] = useState('');
  
  const queryClient = useQueryClient();
  const getTicketsFn = useServerFn(getAllTickets);
  const closeFn = useServerFn(closeTicket);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['admin-all-tickets'],
    queryFn: () => getTicketsFn(),
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => closeFn({ data: id }),
    onSuccess: () => {
      toast.success('Ticket encerrado.');
      queryClient.invalidateQueries({ queryKey: ['admin-all-tickets'] });
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'aberto':
        return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-[10px] uppercase">Aberto</Badge>;
      case 'em_atendimento':
        return <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px] uppercase">Em Atendimento</Badge>;
      case 'concluido':
        return <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] uppercase">Concluído</Badge>;
      default:
        return <Badge className="text-[10px] uppercase">{status}</Badge>;
    }
  };

  const filteredTickets = tickets?.filter((t: any) => {
    const matchesFilter = filter === 'todos' || t.status === filter;
    const matchesSearch = 
      t.subject.toLowerCase().includes(search.toLowerCase()) || 
      t.profile?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.profile?.whatsapp?.includes(search);
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Gestão de Tickets</h1>
          <p className="text-muted-foreground">Gerencie as solicitações de suporte dos seus clientes.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center bg-card/50 p-4 rounded-2xl border border-border/40">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por assunto, cliente ou WhatsApp..." 
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'aberto', label: 'Abertos' },
            { id: 'em_atendimento', label: 'Em Atendimento' },
            { id: 'concluido', label: 'Concluídos' }
          ].map((f) => (
            <Button
              key={f.id}
              variant={filter === f.id ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter(f.id)}
              className="whitespace-nowrap rounded-full px-4"
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center py-20 animate-pulse text-muted-foreground">Carregando tickets...</div>
        ) : filteredTickets?.length === 0 ? (
          <div className="text-center py-20 glass-card rounded-2xl border-dashed border-2">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
            <h3 className="text-xl font-display font-semibold">Nenhum ticket encontrado</h3>
            <p className="text-muted-foreground mt-2">Não há chamados que correspondam aos filtros selecionados.</p>
          </div>
        ) : (
          filteredTickets?.map((ticket: any) => (
            <Card key={ticket.id} className={`glass-card overflow-hidden border-l-4 ${
              ticket.status === 'aberto' ? 'border-l-yellow-500' : 
              ticket.status === 'em_atendimento' ? 'border-l-blue-500' : 'border-l-green-500'
            }`}>
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row">
                  <div className="flex-1 p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getStatusBadge(ticket.status)}
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(ticket.created_at).toLocaleString()}
                          </span>
                        </div>
                        <h3 className="font-bold text-lg leading-tight">{ticket.subject}</h3>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                          <User className="h-3 w-3 text-primary" />
                        </div>
                        <span className="font-medium">{ticket.profile?.full_name || 'Cliente'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <span>{ticket.profile?.whatsapp}</span>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-2 italic">
                      "{ticket.description}"
                    </p>
                  </div>

                  <div className="bg-accent/5 border-t md:border-t-0 md:border-l border-border/40 p-5 flex flex-row md:flex-col justify-center gap-2 shrink-0">
                    <Button asChild variant="secondary" size="sm" className="w-full justify-start">
                      <Link to="/suporte/$id" params={{ id: ticket.id }}>
                        <MessageSquare className="mr-2 h-4 w-4" /> Responder
                      </Link>
                    </Button>
                    {ticket.status !== 'concluido' && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start text-green-500 hover:text-green-600 hover:bg-green-500/10"
                        onClick={() => closeMutation.mutate(ticket.id)}
                        disabled={closeMutation.isPending}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Concluir
                      </Button>
                    )}
                    <Button asChild variant="ghost" size="sm" className="w-full justify-start">
                      <a href={`https://wa.me/${ticket.profile?.whatsapp}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" /> WhatsApp Direto
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
