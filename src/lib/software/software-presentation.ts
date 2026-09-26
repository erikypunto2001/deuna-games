import type {
  Software,
} from "@/types/software";

export function orderPublicSoftware(
  items: readonly Software[]
) {
  return [...items].sort(
    (left, right) =>
      Number(
        right.featured === true
      ) -
        Number(
          left.featured === true
        ) ||
      left.name.localeCompare(
        right.name,
        "es"
      )
  );
}
