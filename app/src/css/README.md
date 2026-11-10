# Typography

`typography.scss` defines the scale. Use one `text-<token>` class for each text
role instead of combining Quasar sizes, font families, weights and case classes.
For SCSS selectors, use `@include type-style('<token>')`.

| Token | Font | Weight | Size / line height (px) | Role |
| --- | --- | --- | --- | --- |
| `display-medium` | Lora | 400 | 45 / 52 | Expanded balance |
| `display-small` | Lora | 600 | 34 / 40 | Statistics totals, profile balance, QR/NFC amounts |
| `display-extra-small` | Lora | 600 | 24 / 32 | Compact values: offer prices, transfer details, chart totals |
| `headline-large` | Lora | 700 | 32 / 40 | Subject name on a detail page |
| `headline-small` | Lora | 700 | 24 / 32 | Subject name in a compact detail view |
| `title-large` | Lora | 700 | 22 / 28 | Toolbar, dialog and marketplace card titles |
| `title-medium` | Lora | 700 | 16 / 28 | Section and pane headings |
| `title-small` | Inter | 600 | 14 / 20 | Primary identifiers in dense rows |
| `body-large` | Inter | 400 | 16 / 24 | Reading text and editable values |
| `body-large-emphasized` | Inter | 700 | 16 / 24 | Emphasized values within a row |
| `body-medium` | Inter | 400 | 14 / 20 | Descriptions and default body text |
| `body-small` | Inter | 400 | 12 / 16 | Captions, timestamps and chart axes |
| `label-large` | Inter | 500 | 14 / 20 | Navigation, sentence-case actions and statistics card/chart titles |
| `label-medium` | Inter | 500 | 12 / 16 | Pill badges |
| `label-small` | Inter | 500 | 11 / 16 | Uppercase compact statuses |

Display values use Lora across balances, statistics and standalone amounts.
Body and UI text use Inter, including emphasized amounts in dense list rows.

Sizes are expressed in rem, relative to the standard 16 px root size. All tokens
use zero letter spacing. Case is also part of the token: `label-small` uses
uppercase, while the other base tokens use `text-transform: none`, preserving
the translated string. Large and medium labels also have an `-uppercase`
variant with otherwise identical properties:

- `label-large-uppercase`: explicit uppercase action labels.
- `label-medium-uppercase`: former overlines, column headings and control groups.

Compact transfer badges and table status chips use `label-small`; they do not
need a separate case variant.

Column headers use `on-surface-medium`, including the member/transfer lists
and Quasar tables. Color stays separate from the typography token.

Quasar controls keep their native line heights, letter spacing and label
scaling, including fields, tables, buttons, tabs, tooltips and item labels.
Their component metrics do not need to match a generic text token. Use explicit
tokens for ordinary text and distinct text roles within components.

Toolbar titles keep [MD3's 22/28 size](https://developer.android.com/develop/ui/compose/designsystems/material3#typography),
with our Lora bold face. Section headings use a roomier 16/28 line height to
suit Lora and preserve the forms' spacing. Card titles get surrounding layout
spacing rather than a different type token.

`quasar.variables.scss` maps the scale to Quasar's component variables and
styles HTML headings through `$h-tags`, including member-authored Markdown.
Quasar's `$headings` map keeps its defaults so native typography utilities
remain available to its components.

`app.scss` generates our `text-<token>` classes using the `type-style()` mixin
and adds the font family for HTML headings.
Components with explicit tokens, such as toolbar titles, chips and badges,
need no global typography overrides.
`TimeSeriesChart.vue` passes its canvas font and palette values from Sass to JavaScript
through a local CSS module. The balance header uses `type-value()` directly
for its scrolling animation. The landing-page slogan keeps its existing
fit-to-width behavior.

Keep layout, color and text role separate. For example:

```html
<h1 class="text-headline-large text-on-surface q-my-none">Community name</h1>
<q-item-label class="text-title-small">Member name</q-item-label>
<span class="text-label-small">Pending</span>
```
