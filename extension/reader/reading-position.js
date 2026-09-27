// Keep the current soundtrack through small reversals at a section boundary.
export function sectionAtFocus(bounds,focus,current=-1,hysteresis=36){
 if(!bounds.length)return -1;
 const active=bounds[current];
 if(active&&focus>=active.top-hysteresis&&focus<=active.bottom+hysteresis)return current;
 const containing=bounds.findIndex(bound=>focus>=bound.top&&focus<bound.bottom);
 if(containing>=0)return containing;
 if(focus<bounds[0].top)return 0;
 return bounds.length-1;
}
