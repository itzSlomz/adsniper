const APIFY_BASE = "https://api.apify.com/v2";

export async function runApifyActorSync<T = unknown>(
  actorId: string,
  input: unknown,
  apiKey: string,
  timeoutSecs = 240
): Promise<T[]> {
  const res = await fetch(
    `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?timeout=${timeoutSecs}&format=json`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout((timeoutSecs + 30) * 1000),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apify actor ${actorId} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T[];
}
