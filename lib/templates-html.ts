// Ce fichier est intentionnellement vide.
// Les templates sont dans data/templates-html.ts et chargés via l'API /api/templates
export type TemplateApp = {
  id: string;
  name: string;
  emoji: string;
  category: string;
  categoryColor: string;
  description: string;
  html: string;
};

export const TEMPLATE_APPS: TemplateApp[] = [];
