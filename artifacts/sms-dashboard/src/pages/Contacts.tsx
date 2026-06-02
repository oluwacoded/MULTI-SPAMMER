import { useState } from "react";
import { useContacts, useCreateContact, useUpdateContact, useDeleteContact } from "@/lib/hooks";
import { useToast } from "@/hooks/use-toast";
import type { Contact } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, User } from "lucide-react";

export default function Contacts() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const { data: contacts, isLoading } = useContacts(query);
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setPhoneNumber("");
    setNotes("");
    setDialogOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    setName(c.name || "");
    setPhoneNumber(c.phoneNumber);
    setNotes(c.notes || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!phoneNumber.trim()) return;
    try {
      if (editing) {
        await updateContact.mutateAsync({
          id: editing.id,
          input: { name, phoneNumber, notes },
        });
        toast({ title: "Contact updated" });
      } else {
        await createContact.mutateAsync({ name, phoneNumber, notes });
        toast({ title: "Contact added" });
      }
      setDialogOpen(false);
    } catch (e) {
      toast({
        title: "Could not save contact",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteContact.mutateAsync(deleteTarget.id);
      toast({ title: "Contact deleted" });
    } catch (e) {
      toast({
        title: "Could not delete contact",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="p-8 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground mt-1">Your address book for messaging and batches.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add contact
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or number..."
          className="pl-9"
        />
      </div>

      <Card className="divide-y">
        {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading contacts...</div>}
        {!isLoading && contacts?.length === 0 && (
          <div className="p-12 text-center">
            <User className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              {query ? "No contacts match your search." : "No contacts yet. Add your first one."}
            </p>
          </div>
        )}
        {contacts?.map((c) => (
          <div key={c.id} className="flex items-center justify-between p-4 hover:bg-muted/40 transition-colors">
            <div className="min-w-0">
              <div className="font-medium truncate">{c.name || "Unnamed"}</div>
              <div className="text-sm text-muted-foreground font-mono">{c.phoneNumber}</div>
              {c.notes && <div className="text-sm text-muted-foreground mt-0.5 truncate">{c.notes}</div>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(c)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit contact" : "Add contact"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update this contact's details." : "Add a new contact to your address book."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Doe" />
            </div>
            <div className="space-y-2">
              <Label>Phone number</Label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+15551234567"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!phoneNumber.trim() || createContact.isPending || updateContact.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {deleteTarget?.name || deleteTarget?.phoneNumber} from your contacts. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
