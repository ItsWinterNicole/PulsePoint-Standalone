import { apiUrl } from "@/lib/mobileApiBase";

export async function getProviderStatus() {
  const response = await fetch(apiUrl("/status/providers"));
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Provider status is not available yet. Restart the local API server after this update.");
    }
    throw new Error(data?.error || data?.message || `Provider status failed: ${response.status}`);
  }
  if (!contentType.includes("application/json")) {
    throw new Error("Provider status is not available yet. Restart the local API server after this update.");
  }
  return data;
}
