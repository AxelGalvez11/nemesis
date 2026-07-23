// Minimal ambient types for markdown-it, which ships no declarations of its
// own. Deliberately NOT `@types/markdown-it`: markdown-it reaches us as a
// transitive dependency of react-native-markdown-display, so pinning a
// separate @types package against a version we don't control invites the two
// to drift. This declares only the surface lib/markdown-obsidian.ts and
// MessageBody.tsx actually touch.

declare module "markdown-it" {
  /** The parser state handed to an inline rule. Only the members our rules
   *  read or write are declared. */
  export interface StateInline {
    src: string;
    pos: number;
    push(type: string, tag: string, nesting: number): { content: string };
  }

  export type InlineRule = (state: StateInline, silent: boolean) => boolean;

  export interface MarkdownItInstance {
    inline: {
      ruler: {
        before(beforeName: string, ruleName: string, rule: InlineRule): void;
        push(ruleName: string, rule: InlineRule): void;
      };
    };
    use(plugin: (md: MarkdownItInstance) => void): MarkdownItInstance;
    render(src: string): string;
  }

  export interface MarkdownItOptions {
    html?: boolean;
    linkify?: boolean;
    typographer?: boolean;
    breaks?: boolean;
  }

  const MarkdownIt: (options?: MarkdownItOptions) => MarkdownItInstance;
  export default MarkdownIt;
}
