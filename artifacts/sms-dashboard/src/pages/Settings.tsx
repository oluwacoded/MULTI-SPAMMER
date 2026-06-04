import { useState } from "react";
import {
  useDevices,
  useCreateDevice,
  useUpdateDevice,
  useDeleteDevice,
  useTestDevice,
} from "@/lib/hooks";
import { useToast } from "@/hooks/use-toast";
import type { Device } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Smartphone, Pencil, Trash2, Plug, Copy, Check } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  if (status === "online") return <Badge className="bg-green-600 hover:bg-green-600">Online</Badge>;
  if (status === "offline") return <Badge variant="destructive">Offline</Badge>;
  return <Badge variant="secondary">Unknown</Badge>;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs font-mono">{value}</code>
        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

const DEFAULT_BASE_URL = "https://api.sms-gate.app/3rdparty/v1";

export default function Settings() {
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const { data: devices, isLoading } = useDevices();
  const createDevice = useCreateDevice();
  const updateDevice = useUpdateDevice();
  const deleteDevice = useDeleteDevice();
  const testDevice = useTestDevice();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setPhoneNumber("");
    setBaseUrl(DEFAULT_BASE_URL);
    setLogin("");
    setPassword("");
    setWebhookSecret("");
    setDialogOpen(true);
  };

  const openEdit = (d: Device) => {
    setEditing(d);
    setName(d.name);
    setPhoneNumber(d.phoneNumber || "");
    setBaseUrl(d.smsgateBaseUrl || DEFAULT_BASE_URL);
    setLogin(d.smsgateLogin || "");
    setPassword("");
    setWebhookSecret("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      if (editing) {
        await updateDevice.mutateAsync({
          id: editing.id,
          input: {
            name,
            phoneNumber,
            smsgateBaseUrl: baseUrl,
            smsgateLogin: login,
            ...(password ? { smsgatePassword: password } : {}),
            ...(webhookSecret ? { webhookSecret } : {}),
          },
        });
        toast({ title: "Device updated" });
      } else {
        await createDevice.mutateAsync({
          name,
          phoneNumber,
          smsgateBaseUrl: baseUrl,
          smsgateLogin: login,
          smsgatePassword: password,
          webhookSecret,
        });
        toast({ title: "Device added" });
      }
      setDialogOpen(false);
    } catch (e) {
      toast({
        title: "Could not save device",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };

  const handleTest = async (d: Device) => {
    setTestingId(d.id);
    try {
      const res = await testDevice.mutateAsync(d.id);
      toast({
        title: res.ok ? "Connection successful" : "Connection failed",
        description: res.message,
        variant: res.ok ? undefined : "destructive",
      });
    } catch (e) {
      toast({
        title: "Connection failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDevice.mutateAsync(deleteTarget.id);
      toast({ title: "Device deleted" });
    } catch (e) {
      toast({
        title: "Could not delete device",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="p-8 space-y-8 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">Connect and manage your SMS gateway devices.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add device
        </Button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading devices...</div>}

      {!isLoading && devices?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Smartphone className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              No devices yet. Add the phone running the SMS Gateway for Android app.
            </p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add your first device
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {devices?.map((d) => (
          <Card key={d.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    {d.name}
                  </CardTitle>
                  <CardDescription className="mt-1 font-mono">
                    {d.phoneNumber || "No number set"}
                  </CardDescription>
                </div>
                <StatusBadge status={d.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={d.hasCredentials ? "default" : "secondary"}>
                  {d.hasCredentials ? "Credentials set" : "No credentials"}
                </Badge>
                <Badge variant={d.hasWebhookSecret ? "default" : "secondary"}>
                  {d.hasWebhookSecret ? "Webhook signed" : "Webhook unsigned"}
                </Badge>
              </div>

              <CopyField label="Webhook URL (paste into the Android app)" value={`${origin}${d.webhookUrl}`} />
              <CopyField label="Webhook token" value={d.webhookToken} />

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTest(d)}
                  disabled={!d.hasCredentials || testingId === d.id}
                >
                  <Plug className="h-4 w-4 mr-2" />
                  {testingId === d.id ? "Testing..." : "Test connection"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEdit(d)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(d)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>{user?.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => logout()}>
            Log out
          </Button>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit device" : "Add device"}</DialogTitle>
            <DialogDescription>
              Enter the Cloud server credentials shown in the SMS Gateway for Android app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Device name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My eSIM" />
            </div>
            <div className="space-y-2">
              <Label>Phone number (optional)</Label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+15551234567"
              />
            </div>
            <div className="space-y-2">
              <Label>Gateway base URL</Label>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Keep the default for Cloud mode, or use your own URL for self-hosted.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Gateway login</Label>
              <Input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="username" />
            </div>
            <div className="space-y-2">
              <Label>Gateway password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editing ? "Leave blank to keep current" : "password"}
              />
            </div>
            <div className="space-y-2">
              <Label>Webhook secret (optional, recommended)</Label>
              <Input
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="Shared HMAC secret"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || createDevice.isPending || updateDevice.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete device?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {deleteTarget?.name} and its webhook. Messages already sent are kept. This cannot be undone.
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
