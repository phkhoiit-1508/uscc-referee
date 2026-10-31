type SearchPlayer = {
  full_name: string;
  external_id: string | null;
  club: string | null;
} | null;

export type SearchableMatch = {
  board_number: number;
  white_player: SearchPlayer;
  black_player: SearchPlayer;
};

export function matchMatchesSearch(match: SearchableMatch, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  if (!normalizedQuery) return true;

  return [
    String(match.board_number),
    match.white_player?.full_name,
    match.white_player?.external_id,
    match.white_player?.club,
    match.black_player?.full_name,
    match.black_player?.external_id,
    match.black_player?.club,
  ].some((value) => value?.toLocaleLowerCase("vi").includes(normalizedQuery));
}
