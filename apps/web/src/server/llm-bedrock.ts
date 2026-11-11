import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { MAX_OUTPUT_TOKENS } from "./llm";
import type { AdapterInput, ProviderAdapter } from "./llm";

/** Tier 2. The model id and region come only from configuration; no id is written here. */
export type BedrockCredentialProvider = () => PromiseLike<{
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}>;
/** `credentialProvider` is present only when a role ARN is configured. */
export type BedrockModelFactory = (settings: {
  region: string;
  credentialProvider?: BedrockCredentialProvider;
}) => (modelId: string) => unknown;
/** Makes the provider that assumes `roleArn` with the host's OIDC token. */
export type RoleCredentials = (roleArn: string) => BedrockCredentialProvider;
/** Each provider caches the credentials it fetches, so one is kept per role rather than one per request. */
function memoByRole(make: RoleCredentials): RoleCredentials {
  const made = new Map<string, BedrockCredentialProvider>();
  return (roleArn) => {
    const known = made.get(roleArn);
    if (known !== undefined) return known;
    const created = make(roleArn);
    made.set(roleArn, created);
    return created;
  };
}
/** The package's provider is assignable to the option's type as it stands, so no adapter function is needed. */
const oidcRoleCredentials: RoleCredentials = (roleArn) => awsCredentialsProvider({ roleArn });

export const BEDROCK_FAILED = "assistant provider failed";

/**
 * Builds the Bedrock adapter. The factory is a seam so tests can see which id and
 * region the model was built from without the SDK or any network.
 */
export function createBedrockAdapter(
  factory: BedrockModelFactory,
  roleCredentials: RoleCredentials = oidcRoleCredentials,
): ProviderAdapter {
  const credentialsFor = memoByRole(roleCredentials);
  return async function* bedrockAdapter(
    input: AdapterInput,
  ): AsyncGenerator<string, void, undefined> {
    const settings = input.config.bedrock;
    if (settings === null) throw new Error(BEDROCK_FAILED);
    try {
      const model = factory({
        region: settings.region,
        ...(settings.roleArn === null
          ? {}
          : { credentialProvider: credentialsFor(settings.roleArn) }),
      })(settings.modelId);
      const result = input.streamText({
        model,
        system: input.system,
        prompt: input.prompt,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        ...(input.signal === undefined ? {} : { abortSignal: input.signal }),
      });
      yield* result.textStream;
    } catch {
      // Provider text can carry request details; callers get a fixed message only.
      throw new Error(BEDROCK_FAILED);
    }
  };
}

export const bedrockAdapter: ProviderAdapter = createBedrockAdapter((settings) =>
  createAmazonBedrock(settings),
);
