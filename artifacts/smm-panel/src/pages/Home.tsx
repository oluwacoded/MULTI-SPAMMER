import React, { useState, useMemo } from "react";
import { Link } from "wouter";
import { useGetSmmServices } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Info, ShoppingCart } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/utils";

export default function Home() {
  const { data, isLoading } = useGetSmmServices();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const categories = useMemo(() => {
    if (!data?.categories) return ["All"];
    return ["All", ...data.categories];
  }, [data]);

  const filteredServices = useMemo(() => {
    if (!data?.services) return [];
    return data.services.filter((s) => {
      const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || 
                           s.service.includes(search);
      const matchesCategory = activeCategory === "All" || s.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [data, search, activeCategory]);

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Services Catalog</h1>
          <p className="text-muted-foreground mt-1">Browse and order high-quality social media services.</p>
        </div>
        <div className="w-full md:w-72 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search services..." 
            className="pl-9 bg-card border-border h-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="w-full overflow-x-auto pb-2 hide-scrollbar">
            <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
              <TabsList className="h-10 bg-card border border-border inline-flex w-max min-w-full justify-start px-1">
                {categories.map(cat => (
                  <TabsTrigger 
                    key={cat} 
                    value={cat}
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4"
                    data-testid={`tab-category-${cat.replace(/\s+/g, '-')}`}
                  >
                    {cat}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {filteredServices.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-border rounded-lg bg-card/50">
              <Info className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-medium">No services found</h3>
              <p className="text-sm text-muted-foreground">Try adjusting your search or category filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredServices.map(service => (
                <Card key={service.service} className="bg-card border-border hover:border-primary/50 transition-colors flex flex-col group">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <Badge variant="outline" className="font-mono text-xs text-muted-foreground bg-secondary/50">
                        ID: {service.service}
                      </Badge>
                      <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">
                        {service.type}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-sm line-clamp-2 min-h-[2.5rem] group-hover:text-primary transition-colors" title={service.name}>
                      {service.name}
                    </h3>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 flex-1">
                    <div className="flex items-end gap-1 mb-4">
                      <span className="text-2xl font-bold tracking-tight text-foreground">
                        {formatMoney(service.rate)}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">/ 1000</span>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-medium bg-secondary/50 p-2 rounded-md">
                      <div className="flex flex-col">
                        <span className="uppercase text-[10px] opacity-70">Min</span>
                        <span>{service.min}</span>
                      </div>
                      <div className="w-px h-6 bg-border"></div>
                      <div className="flex flex-col text-right">
                        <span className="uppercase text-[10px] opacity-70">Max</span>
                        <span>{service.max}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="p-4 pt-0">
                    <Link href={`/order?service=${service.service}`} className="w-full">
                      <Button className="w-full font-bold shadow-[0_0_15px_rgba(34,197,94,0.15)] hover:shadow-[0_0_20px_rgba(34,197,94,0.3)] transition-all" data-testid={`btn-order-${service.service}`}>
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Order Now
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
