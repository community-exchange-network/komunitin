import { marked } from "marked";
import DOMPurify from "dompurify";

export default function(value: string ): string {
  return DOMPurify.sanitize(marked(value, {
    gfm: true,
    breaks: true
  }));
}
