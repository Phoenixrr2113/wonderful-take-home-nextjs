declare module "geokdbush" {
  import KDBush from "kdbush";
  export function around(
    index: KDBush,
    longitude: number,
    latitude: number,
    maxResults?: number,
    maxDistance?: number,
    predicate?: (index: number) => boolean
  ): number[];
}
