/**
 * This file contains utility functions for processing Handlebars templates.
 */

import Handlebars from 'handlebars';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';


import initI18n from './i18n';

const templateCache = new Map<string, Handlebars.TemplateDelegate>();
const templateDir = fileURLToPath(new URL('../templates', import.meta.url));

const overridesCache = new Map<string, Record<string, Handlebars.TemplateDelegate>>();

const loadOverrides = async () => {
  const overridesDir = path.join(templateDir, 'overrides');
  const files = await fs.readdir(overridesDir);
  for (const file of files) {
    if (file.endsWith('.hbs')) {
      // expected format: <template_name>.<override_name>.hbs
      const name = path.basename(file, '.hbs');
      const parts = name.split('.');
      if (parts.length >= 2) { 
        const overrideName = parts.pop()!;
        const templateName = parts.join('.');
        
        const source = await fs.readFile(path.join(overridesDir, file), 'utf-8');
        const template = Handlebars.compile(source);
        
        if (!overridesCache.has(templateName)) {
          overridesCache.set(templateName, {});
        }
        overridesCache.get(templateName)![overrideName] = template;
      }
    }
  }
}

const registerPartials = async (dir: string) => {
  const partialsDir = path.join(templateDir, dir);
  const files = await fs.readdir(partialsDir);
  for (const file of files) {
    if (file.endsWith('.hbs')) {
      const name = path.basename(file, '.hbs');
      const source = await fs.readFile(path.join(partialsDir, file), 'utf-8');
      Handlebars.registerPartial(name, source);
    }
  }
}

const initializeTemplates = async () => {
  await registerPartials('partials');
  await registerPartials('layouts');
  await loadOverrides();
}

// Initialize templates on startup, keeping the promise so we can check 
// if it's done before rendering.
const initializePromise = initializeTemplates();

// Catch and log the error to prevent an unhandled rejection crash at module load,
// but keep the original promise so that awaiting it later will still throw the error.
initializePromise.catch(err => {
  console.error('Error initializing templates', err);
});

const loadTemplate = async (name: string): Promise<Handlebars.TemplateDelegate> => {
  await initializePromise;  
  const templatePath = path.join(templateDir, 'emails', `${name}.hbs`);
  if (!templateCache.has(templatePath)) {
    const source = await fs.readFile(templatePath, 'utf-8');
    const template = Handlebars.compile(source);
    templateCache.set(templatePath, template);  
  }
  return templateCache.get(templatePath)!;
}

export interface TemplateContext {
  // Lang code to use for translations.
  language: string;

  // Template-specific variables
  [key: string]: unknown;
}

export const renderTemplate = async (name: string, context: TemplateContext): Promise<string> => {
  // Load template
  const template = await loadTemplate(name);
  
  // Translation setup
  const lng = context.language;
  const i18n = await initI18n();
  const helpers = {
    t: (key: string, options: any) => {
      return i18n.t(key, { lng, ...options.hash });
    }
  };

  const partials = overridesCache.get(name);

  return template(context, { helpers, partials });
}
