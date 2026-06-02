import { useState } from "react";
import { useThreads, useMessages, useMarkThreadRead, useSendMessage, useDevices } from "@/lib/hooks";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Check, CheckCheck, Clock, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

function MessageStatus({ status }: { status: string }) {
  switch (status) {
    case "queued": return <Clock className="h-3 w-3 text-muted-foreground" />;
    case "sent": return <Check className="h-3 w-3 text-muted-foreground" />;
    case "delivered": return <CheckCheck className="h-3 w-3 text-primary" />;
    case "failed": return <AlertCircle className="h-3 w-3 text-destructive" />;
    default: return null;
  }
}

export default function Conversations() {
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [composeBody, setComposeBody] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  
  const { data: threads } = useThreads();
  const { data: messages } = useMessages(selectedThreadId);
  const markRead = useMarkThreadRead();
  const sendMessage = useSendMessage();
  const { data: devices } = useDevices();

  const handleSelectThread = (id: number) => {
    setSelectedThreadId(id);
    markRead.mutate(id);
  };

  const handleSend = () => {
    const thread = threads?.find(t => t.id === selectedThreadId);
    if (!thread || !composeBody.trim() || !selectedDeviceId) return;
    
    sendMessage.mutate({
      deviceId: parseInt(selectedDeviceId, 10),
      to: thread.contactPhone,
      body: composeBody
    }, {
      onSuccess: () => setComposeBody("")
    });
  };

  const activeThread = threads?.find(t => t.id === selectedThreadId);

  return (
    <div className="flex h-full">
      <div className="w-80 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold tracking-tight">Conversations</h2>
        </div>
        <ScrollArea className="flex-1">
          {threads?.map(thread => (
            <div 
              key={thread.id} 
              onClick={() => handleSelectThread(thread.id)}
              className={`p-4 border-b cursor-pointer transition-colors hover:bg-muted/50 ${selectedThreadId === thread.id ? 'bg-muted' : ''}`}
            >
              <div className="flex justify-between items-baseline mb-1">
                <div className="font-medium text-sm truncate flex-1">{thread.contactName || thread.contactPhone}</div>
                {thread.lastMessageAt && (
                  <div className="text-xs text-muted-foreground ml-2 whitespace-nowrap">
                    {format(new Date(thread.lastMessageAt), 'MMM d, HH:mm')}
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground truncate flex-1">
                  {thread.lastDirection === 'outbound' && <span className="mr-1">You:</span>}
                  {thread.lastMessagePreview || "No messages"}
                </div>
                {thread.unreadCount > 0 && (
                  <div className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full ml-2">
                    {thread.unreadCount}
                  </div>
                )}
              </div>
            </div>
          ))}
          {(!threads || threads.length === 0) && (
            <div className="p-8 text-center text-muted-foreground text-sm">No conversations yet</div>
          )}
        </ScrollArea>
      </div>
      
      <div className="flex-1 flex flex-col bg-background">
        {selectedThreadId ? (
          <>
            <div className="p-4 border-b bg-card">
              <h3 className="font-semibold">{activeThread?.contactName || activeThread?.contactPhone}</h3>
              <div className="text-sm text-muted-foreground">{activeThread?.contactPhone}</div>
            </div>
            
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 flex flex-col justify-end min-h-full">
                {messages?.map(msg => {
                  const isInbound = msg.direction === 'inbound';
                  return (
                    <div key={msg.id} className={`flex flex-col max-w-[70%] ${isInbound ? 'self-start' : 'self-end'}`}>
                      <div className={`p-3 rounded-2xl ${isInbound ? 'bg-secondary text-secondary-foreground rounded-tl-sm' : 'bg-primary text-primary-foreground rounded-tr-sm'}`}>
                        {msg.body}
                      </div>
                      <div className={`text-xs text-muted-foreground mt-1 flex items-center gap-1 ${isInbound ? 'self-start' : 'self-end'}`}>
                        {format(new Date(msg.createdAt), 'HH:mm')}
                        {!isInbound && <MessageStatus status={msg.status} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            
            <div className="p-4 border-t bg-card">
              <div className="flex gap-2 mb-2">
                <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                  <SelectTrigger className="w-[200px] h-9">
                    <SelectValue placeholder="Select device..." />
                  </SelectTrigger>
                  <SelectContent>
                    {devices?.map(d => (
                      <SelectItem key={d.id} value={d.id.toString()}>{d.name} ({d.phoneNumber || 'No #'})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Input 
                  value={composeBody} 
                  onChange={e => setComposeBody(e.target.value)}
                  placeholder="Type a message..."
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                />
                <Button onClick={handleSend} disabled={!composeBody.trim() || !selectedDeviceId || sendMessage.isPending}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select a conversation to start messaging
          </div>
        )}
      </div>
    </div>
  );
}
