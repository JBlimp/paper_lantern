import type { Rect } from './bodyFilter.ts';
type Matrix = number[];
const multiply = (a: Matrix, b: Matrix): Matrix => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
function rectangle(box: ArrayLike<number>, matrix: Matrix): Rect {
  const points = [[box[0],box[1]],[box[2],box[1]],[box[2],box[3]],[box[0],box[3]]].map(([x,y]) => [matrix[0]*x+matrix[2]*y+matrix[4], matrix[1]*x+matrix[3]*y+matrix[5]]);
  const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]));
  return { x, y, width: Math.max(...points.map(p => p[0]))-x, height: Math.max(...points.map(p => p[1]))-y };
}
export function graphicRegions(list: { fnArray: number[]; argsArray: any[] }, ops: Record<string, number>, viewport: Matrix, width: number, height: number): Rect[] {
  let matrix = [...viewport]; const stack: Matrix[] = [], shapes: (Rect & { count: number; image: boolean })[] = [];
  const add = (box: ArrayLike<number>, image = false) => {
    const rect = rectangle(box, matrix);
    if (!Object.values(rect).every(Number.isFinite) || rect.width*rect.height > width*height*.65 || Math.max(rect.width,rect.height) < 12) return;
    shapes.push({ ...rect, count: 1, image });
  };
  const painted = new Set(['stroke','closeStroke','fill','eoFill','fillStroke','eoFillStroke','closeFillStroke','closeEOFillStroke'].map(name => ops[name]));
  for (let i=0; i<list.fnArray.length; i++) {
    const op = list.fnArray[i], args = list.argsArray[i] ?? [];
    if (op === ops.save || op === ops.paintFormXObjectBegin) { stack.push([...matrix]); if (op === ops.paintFormXObjectBegin && args[0]) matrix = multiply(matrix,args[0]); }
    else if (op === ops.restore || op === ops.paintFormXObjectEnd) matrix = stack.pop() ?? [...viewport];
    else if (op === ops.transform) matrix = multiply(matrix,args);
    else if (op === ops.constructPath && painted.has(args[0]) && args[2]?.length === 4) add(args[2]);
    else if (op === ops.paintImageXObject || op === ops.paintInlineImageXObject || op === ops.paintImageMaskXObject) add([0,0,1,1], true);
  }
  // Join connected bars, axes, or table rules; an isolated underline or border
  // is insufficient evidence for a graphic.
  const groups: typeof shapes = [];
  for (const shape of shapes) {
    let joined = { ...shape };
    for (let i=groups.length-1; i>=0; i--) {
      const g = groups[i], pad = 5;
      if (joined.x > g.x+g.width+pad || joined.x+joined.width < g.x-pad || joined.y > g.y+g.height+pad || joined.y+joined.height < g.y-pad) continue;
      const x = Math.min(joined.x,g.x), y = Math.min(joined.y,g.y);
      joined = { x, y, width: Math.max(joined.x+joined.width,g.x+g.width)-x, height: Math.max(joined.y+joined.height,g.y+g.height)-y, count: joined.count+g.count, image: joined.image||g.image };
      groups.splice(i,1);
      i = groups.length;
    }
    groups.push(joined);
  }
  return groups.filter(g => (g.image || g.count >= 3) && g.width >= 45 && g.height >= 28 && g.width*g.height < width*height*.65);
}
