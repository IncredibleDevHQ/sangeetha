export type NoteCue = {
  start: number;
  end: number;
  note: string;
  beat?: string;
};
export function activeCue(cues: NoteCue[], seconds: number) {
  return cues.findIndex((c) => seconds >= c.start && seconds < c.end);
}
