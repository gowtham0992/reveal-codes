import type { Declaration } from "@reveal-codes/engine";
import type { OrderContext } from "../../src/index.js";
export declare const DEMO_DECLARATION: Declaration;
export declare function buildDemoDocumentStatement(orderContext?: OrderContext, declaration?: Declaration | null): Promise<{
    statement: Readonly<{
        order: import("../../src/types.js").StatementOrder | null;
        aiPassages: readonly import("../../src/ai-paragraphs.js").AiPassage[];
        runCount: number;
        confidentialityCertified: boolean;
        aiUsed: boolean;
        assistantText: boolean;
        declaration: Declaration | null;
        tools: readonly import("../../src/types.js").StatementTool[];
        characters: import("../../src/types.js").OriginCounts;
        sentences: Readonly<{
            total: number;
            byDominantOrigin: import("../../src/types.js").OriginCounts;
        }>;
        citations: readonly import("../../src/types.js").StatementCitation[];
        quotes: readonly import("../../src/types.js").StatementQuote[];
        overrides: readonly import("../../src/types.js").StatementOverride[];
        generatedAt: string;
        generatedDate: string;
        verifiedAt: string | null;
        verifiedDate: string | null;
        caption: string;
    }>;
    blocks: readonly import("../../src/types.js").StatementBlock[];
}>;
