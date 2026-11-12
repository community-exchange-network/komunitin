# CSS and design tokens

The app combines Quasar's components and layout utilities with shared color and
typography tokens. Tokens describe the purpose of a style, so the same roles
look consistent across pages and can be adjusted centrally.

## Where styles live

- [quasar.variables.scss](quasar.variables.scss) defines the color palette,
  semantic color tokens and Quasar theme overrides, including spacing within
  controls, borders and shadows. It also imports the typography definitions.
- [typography.scss](typography.scss) defines the text roles and their font
  families, weights, sizes, line heights and case. It provides the
  `type-style()` mixin and `type-value()` function for use in SCSS.
- [app.scss](app.scss) loads the fonts, exposes custom color classes, generates
  typography classes and defines shared styles that Quasar's configuration
  cannot express.

Quasar makes the theme variables and typography helpers available in component
SCSS. The definitions above are the reference for available tokens and their
exact values.

## Colors

Colors have two layers: a palette of named hues and semantic tokens that assign
those hues to UI roles. The warm palette gives the app a common visual identity;
semantic names let components express why they use a color. Use tokens such as
`surface` or `offer` in components, keeping literal color values in the palette.
Roles can share a color today and still evolve independently later.

Background and foreground roles work together. `surface` is used for cards,
while `surface-container` and its stronger variants provide background layers.
The `on-*` colors identify text intended for a particular background, with
emphasis variants for primary and supporting content. Choose the foreground
for the background it sits on.

Other tokens convey meaning: marketplace roles, transfer states and signed
amounts. For example, `amount-negative` describes an amount's sign; Quasar's
`negative` denotes an error.

Quasar supplies classes for its standard theme colors, such as `bg-primary`.
Custom background and foreground classes are defined explicitly in
[app.scss](app.scss) as `bg-<token>` and `text-<token>`. These also support Quasar
props such as `color="surface"` and `text-color="on-surface"`. Defining a Sass
variable alone does not create a CSS class; expose the background or foreground
utility needed by its consumers.

## Typography

Typography roles establish a hierarchy: displays emphasize standalone values,
headlines identify page subjects, titles introduce sections, body styles serve
reading text, and labels serve compact UI text. Choose a role based on the
content's purpose, then the size appropriate to its context.

Lora gives displays and larger headings a distinctive serif face. Inter keeps
body text, labels and small titles readable in dense interfaces. Each token
bundles the complete text style, including case, so components do not need to
assemble font, weight and size independently. Sizes and line heights use `rem`
to follow the reader's root font size. See [typography.scss](typography.scss)
for the scale and its variants.

Use one `text-<role>` class for a text element. Keep its color and layout
separate, so the same role can be reused on different surfaces:

```html
<h1 class="text-headline-large text-on-surface q-my-none">Community name</h1>
<p class="text-body-medium text-on-surface-medium q-mt-sm">Description</p>
```

For custom SCSS, `@include type-style('body-medium')` applies a complete role;
`type-value('body-medium', size)` reads an individual property. HTML headings
also receive theme defaults, so content rendered from Markdown follows the
same visual hierarchy. Choose HTML heading levels for document structure and
text classes for appearance.

## Icons

The [Vite plugin](../../build-tools/vite-plugin-material-symbols.ts) builds one WOFF2
from the *Material Symbols Rounded* font in `@quasar/extras` subsetting the font to icons used in the app and the [marketplace icons](../assets/fonts/marketplace-icons.json) available as marketplace category icons. Development serves the variable source so new icons work with hot reload.

## Working with Quasar and flavors

Prefer Quasar components and utilities for layout, spacing and interaction.
The theme maps shared tokens to Quasar variables where appropriate, while
controls retain their own sizing and label behavior. Apply explicit typography
roles to content within controls when needed; avoid blanket overrides of their
internal styles.

Use scoped SCSS for component behavior that utilities cannot express. Put
reusable visual decisions in the shared tokens and reusable style rules in
[app.scss](app.scss).

Flavor overrides live in [flavors/komunitin](flavors/komunitin/override.variables.scss)
and [flavors/ces](flavors/ces/override.variables.scss). Both currently use the
shared theme. The build copies the selected flavor's overrides to
`override.variables.scss`, which is imported at the end of the theme; edit the
flavor source, not the generated copy.
