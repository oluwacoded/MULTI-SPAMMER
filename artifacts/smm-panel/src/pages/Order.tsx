import React, { useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetSmmServices, usePlaceSmmOrder } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, ShoppingBag, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const orderSchema = z.object({
  service: z.string().min(1, "Please select a service"),
  link: z.string().min(1, "Link is required").url("Must be a valid URL"),
  quantity: z.coerce.number().int().positive("Quantity must be a positive number")
});

type OrderFormValues = z.infer<typeof orderSchema>;

export default function Order() {
  const [location, setLocation] = useLocation();
  const { data: servicesData, isLoading: servicesLoading } = useGetSmmServices();
  const placeOrder = usePlaceSmmOrder();
  const { toast } = useToast();

  const searchParams = new URLSearchParams(window.location.search);
  const initialService = searchParams.get("service") || "";

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      service: initialService,
      link: "",
      quantity: 1000,
    },
  });

  const selectedServiceId = form.watch("service");
  const quantity = form.watch("quantity");

  const selectedService = useMemo(() => {
    if (!servicesData?.services || !selectedServiceId) return null;
    return servicesData.services.find(s => s.service === selectedServiceId) || null;
  }, [servicesData, selectedServiceId]);

  // Update validation when service changes
  useEffect(() => {
    if (selectedService) {
      const min = parseInt(selectedService.min, 10);
      const max = parseInt(selectedService.max, 10);
      
      const newSchema = z.object({
        service: z.string().min(1, "Please select a service"),
        link: z.string().min(1, "Link is required").url("Must be a valid URL"),
        quantity: z.coerce.number().int()
          .min(min, `Minimum quantity is ${min}`)
          .max(max, `Maximum quantity is ${max}`)
      });
      
      // Update quantity if it's out of bounds
      const currentQty = form.getValues("quantity");
      if (currentQty && !isNaN(currentQty)) {
        if (currentQty < min) form.setValue("quantity", min, { shouldValidate: true });
        if (currentQty > max) form.setValue("quantity", max, { shouldValidate: true });
      } else {
        form.setValue("quantity", min, { shouldValidate: true });
      }
    }
  }, [selectedService, form]);

  const totalCost = useMemo(() => {
    if (!selectedService || isNaN(quantity) || quantity <= 0) return 0;
    const rate = parseFloat(selectedService.rate);
    return (rate * quantity) / 1000;
  }, [selectedService, quantity]);

  const mutateRef = useRef(placeOrder.mutate);
  mutateRef.current = placeOrder.mutate;

  function onSubmit(values: OrderFormValues) {
    if (!selectedService) return;
    
    mutateRef.current({ data: values }, {
      onSuccess: (result) => {
        if (result.ok && result.orderId) {
          toast({
            title: "Order Placed Successfully",
            description: `Order ID: ${result.orderId}`,
            variant: "default",
          });
          setLocation(`/status?id=${result.orderId}`);
        } else {
          toast({
            title: "Order Failed",
            description: result.message || "Unknown error occurred",
            variant: "destructive",
          });
        }
      },
      onError: (error: any) => {
        toast({
          title: "API Error",
          description: error?.message || "Failed to submit order",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="max-w-3xl mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">New Order</h1>
        <p className="text-muted-foreground mt-1">Configure and submit your social media service order.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="bg-card border-border shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-primary" />
                Order Details
              </CardTitle>
              <CardDescription>Select a service and provide the target URL.</CardDescription>
            </CardHeader>
            <CardContent>
              {servicesLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" id="order-form">
                    <FormField
                      control={form.control}
                      name="service"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold text-foreground">Service</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-secondary/50 border-border h-12">
                                <SelectValue placeholder="Select a service" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[300px] border-border bg-popover">
                              {servicesData?.categories.map(cat => (
                                <React.Fragment key={cat}>
                                  <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider bg-secondary/50 mt-1 first:mt-0">
                                    {cat}
                                  </div>
                                  {servicesData.services
                                    .filter(s => s.category === cat)
                                    .map(s => (
                                      <SelectItem key={s.service} value={s.service} className="cursor-pointer">
                                        ID: {s.service} - {s.name} (${parseFloat(s.rate).toFixed(2)}/1k)
                                      </SelectItem>
                                    ))}
                                </React.Fragment>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="link"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold text-foreground">Target Link</FormLabel>
                          <FormControl>
                            <Input placeholder="https://instagram.com/..." className="bg-secondary/50 border-border h-12 font-mono text-sm" {...field} data-testid="input-link" />
                          </FormControl>
                          <FormDescription>The URL to the profile, post, or video.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold text-foreground">Quantity</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              className="bg-secondary/50 border-border h-12 font-mono text-lg" 
                              {...field} 
                              data-testid="input-quantity"
                            />
                          </FormControl>
                          {selectedService && (
                            <FormDescription className="flex gap-4">
                              <span>Min: <strong className="text-foreground">{selectedService.min}</strong></span>
                              <span>Max: <strong className="text-foreground">{selectedService.max}</strong></span>
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <Card className="bg-card border-primary/20 shadow-[0_0_30px_rgba(34,197,94,0.05)]">
              <CardHeader className="bg-secondary/30 pb-4 border-b border-border">
                <CardTitle className="text-lg">Summary</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                {!selectedService ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    Select a service to see order summary
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Service Rate</div>
                      <div className="font-mono">${parseFloat(selectedService.rate).toFixed(3)} <span className="text-muted-foreground text-sm">per 1000</span></div>
                    </div>
                    
                    <div className="w-full h-px bg-border my-2"></div>
                    
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Total Charge</div>
                      <div className="text-4xl font-bold tracking-tight text-primary flex items-baseline gap-1" data-testid="display-total">
                        <span className="text-2xl">$</span>
                        {totalCost.toFixed(3)}
                      </div>
                    </div>

                    {selectedService.description && (
                      <Alert className="bg-secondary/50 border-primary/20 mt-4 py-3">
                        <AlertCircle className="h-4 w-4 text-primary" />
                        <AlertTitle className="text-xs uppercase tracking-wider text-primary font-bold">Service Note</AlertTitle>
                        <AlertDescription className="text-xs mt-1 text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {selectedService.description}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </CardContent>
              <CardFooter className="bg-secondary/30 border-t border-border pt-4">
                <Button 
                  type="submit" 
                  form="order-form" 
                  className="w-full h-12 font-bold text-lg" 
                  disabled={!selectedService || placeOrder.isPending}
                  data-testid="btn-submit-order"
                >
                  {placeOrder.isPending ? "Processing..." : "Confirm Order"}
                  {!placeOrder.isPending && <ArrowRight className="ml-2 h-5 w-5" />}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
