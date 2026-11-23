export const catalogThumbnailOrigin = "https://cdn.dummyjson.com";

export function approvedCatalogThumbnail(value: string | undefined): string | undefined {
  if (!value) return;

  try {
    const url = new URL(value);

    if (
      url.origin === catalogThumbnailOrigin &&
      url.href === url.origin + url.pathname &&
      !/%2f|%5c/i.test(url.pathname) &&
      /^\/(?:product-images|products\/images)\/.+\.(?:webp|png|jpe?g)$/i.test(url.pathname)
    )
      return url.href;
  } catch {
    return undefined;
  }
}
