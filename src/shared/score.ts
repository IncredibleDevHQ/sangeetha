export type NoteCue = {
  start: number;
  end: number;
  note: string;
  beat?: string;
  barStart?: boolean;
};
export function activeCue(cues: NoteCue[], seconds: number) {
  return cues.findIndex((c) => seconds >= c.start && seconds < c.end);
}

export function groupCues(cues: NoteCue[]) {
  const explicit = cues.some((c) => c.barStart);
  const groups: { cue: NoteCue; index: number }[][] = [];
  cues.forEach((cue, index) => {
    if (index === 0 || (explicit ? cue.barStart : index % 4 === 0))
      groups.push([]);
    groups[groups.length - 1].push({ cue, index });
  });
  return groups;
}
