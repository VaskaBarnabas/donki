import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { COMPLETED_PHASE, type ModuleInfo } from "@/lib/site-content";

export function ModuleCard({ module }: { module: ModuleInfo }) {
  const ready = module.phase <= COMPLETED_PHASE;

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle>{module.name}</CardTitle>
          <Badge variant={ready ? "default" : "outline"} className="shrink-0">
            {ready ? "Elkészült" : `${module.phase}. fázis`}
          </Badge>
        </div>
        <CardDescription>{module.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{module.protocol}</Badge>
          <code className="text-muted-foreground">{module.idExample}</code>
        </div>
        <code className="break-all text-muted-foreground">{module.endpoint}</code>
      </CardContent>
    </Card>
  );
}
