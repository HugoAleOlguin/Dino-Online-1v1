export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Standard AABB collision check between two rectangles.
 * An optional margin can be passed to make hitboxes forgiving and avoid frustrating edge clips.
 */
export function checkAABBCollision(
  a: Box,
  b: Box,
  marginHorizontal = 0,
  marginVertical = 0
): boolean {
  const aLeft = a.x + marginHorizontal;
  const aRight = a.x + a.width - marginHorizontal;
  const aBottom = a.y + marginVertical;
  const aTop = a.y + a.height - marginVertical;

  const bLeft = b.x + marginHorizontal;
  const bRight = b.x + b.width - marginHorizontal;
  const bBottom = b.y + marginVertical;
  const bTop = b.y + b.height - marginVertical;

  return !(
    aRight <= bLeft ||
    aLeft >= bRight ||
    aTop <= bBottom ||
    aBottom >= bTop
  );
}
