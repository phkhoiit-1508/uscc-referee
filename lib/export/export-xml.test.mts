import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeXml,
  generateSwissManagerXml,
  mapToSwissManagerResultCode,
  resolveSwissIdAttributes,
  type ExportableMatch,
} from "./export-xml.ts";

test("mapToSwissManagerResultCode: kết quả chuẩn và hòa", () => {
  assert.equal(mapToSwissManagerResultCode("1-0", "normal"), "1-0");
  assert.equal(mapToSwissManagerResultCode("0-1", "normal"), "0-1");
  // CRITICAL: Draw is "1/2", not "1/2-1/2" in Swiss-Manager XML
  assert.equal(mapToSwissManagerResultCode("1/2-1/2", "normal"), "1/2");
  assert.equal(mapToSwissManagerResultCode("1/2", "normal"), "1/2");
});

test("mapToSwissManagerResultCode: kết quả xử thua (forfeit)", () => {
  assert.equal(mapToSwissManagerResultCode("1-0", "forfeit"), "1-0F");
  assert.equal(mapToSwissManagerResultCode("0-1", "forfeit"), "0-1F");
  assert.equal(mapToSwissManagerResultCode("1-0", "absence"), "1-0F");
  assert.equal(mapToSwissManagerResultCode("0-1", "absence"), "0-1F");
  assert.equal(mapToSwissManagerResultCode("0-0", "forfeit"), "0-0F");
  assert.equal(mapToSwissManagerResultCode("1/2-1/2", "forfeit"), "0-0F");
});

test("escapeXml: chống XML injection và escape ký tự đặc biệt", () => {
  assert.equal(escapeXml('1 < 2 & 3 > 0 "quote" \'apos\''), "1 &lt; 2 &amp; 3 &gt; 0 &quot;quote&quot; &apos;apos&apos;");
  assert.equal(escapeXml(null), "");
  assert.equal(escapeXml(123), "123");
});

test("resolveSwissIdAttributes: phân biệt Start-Rank No, Ident No và Unique ID", () => {
  // SNo
  const snoPair = resolveSwissIdAttributes(
    { full_name: "A", external_id: "1", source_id_type: "swiss_start_rank_no" },
    { full_name: "B", external_id: "2", source_id_type: "swiss_start_rank_no" },
  );
  assert.deepEqual(snoPair, {
    whiteAttr: "PlayerWhiteSNo",
    blackAttr: "PlayerBlackSNo",
    whiteVal: "1",
    blackVal: "2",
  });

  // Ident No
  const identPair = resolveSwissIdAttributes(
    { full_name: "A", external_id: "VN1001", source_id_type: "swiss_ident_no" },
    { full_name: "B", external_id: "VN1002", source_id_type: "swiss_ident_no" },
  );
  assert.deepEqual(identPair, {
    whiteAttr: "PlayerWhiteId",
    blackAttr: "PlayerBlackId",
    whiteVal: "VN1001",
    blackVal: "VN1002",
  });

  // Unique ID
  const uniquePair = resolveSwissIdAttributes(
    { full_name: "A", external_id: "U999", source_id_type: "swiss_unique_id" },
    { full_name: "B", external_id: "U888", source_id_type: "swiss_unique_id" },
  );
  assert.deepEqual(uniquePair, {
    whiteAttr: "PlayerWhiteUniqueId",
    blackAttr: "PlayerBlackUniqueId",
    whiteVal: "U999",
    blackVal: "U888",
  });

  // Lệch hệ ID (Trắng SNo, Đen Ident) -> từ chối
  const mismatch = resolveSwissIdAttributes(
    { full_name: "A", external_id: "1", source_id_type: "swiss_start_rank_no" },
    { full_name: "B", external_id: "VN1002", source_id_type: "swiss_ident_no" },
  );
  assert.equal(mismatch, null);
});

test("generateSwissManagerXml: chỉ xuất ván official, loại bỏ pending và disputed", () => {
  const matches: ExportableMatch[] = [
    {
      id: "m1",
      round_number: 1,
      board_number: 1,
      status: "official",
      result_code: "1-0",
      result_kind: "normal",
      white_player: { full_name: "Nguyễn An", external_id: "1", source_id_type: "swiss_start_rank_no" },
      black_player: { full_name: "Trần Bình", external_id: "2", source_id_type: "swiss_start_rank_no" },
    },
    {
      id: "m2",
      round_number: 1,
      board_number: 2,
      status: "pending_white",
      result_code: "0-1",
      result_kind: "normal",
      white_player: { full_name: "Lê Chi", external_id: "3", source_id_type: "swiss_start_rank_no" },
      black_player: { full_name: "Phạm Dũng", external_id: "4", source_id_type: "swiss_start_rank_no" },
    },
    {
      id: "m3",
      round_number: 1,
      board_number: 3,
      status: "disputed",
      result_code: "1/2-1/2",
      result_kind: "normal",
      white_player: { full_name: "Vũ Hải", external_id: "5", source_id_type: "swiss_start_rank_no" },
      black_player: { full_name: "Mai Lan", external_id: "6", source_id_type: "swiss_start_rank_no" },
    },
    {
      id: "m4",
      round_number: 1,
      board_number: 4,
      status: "official",
      result_code: "1/2-1/2",
      result_kind: "normal",
      white_player: { full_name: "Kỳ Thủ 7", external_id: "7", source_id_type: "swiss_start_rank_no" },
      black_player: { full_name: "Kỳ Thủ 8", external_id: "8", source_id_type: "swiss_start_rank_no" },
    },
  ];

  const result = generateSwissManagerXml(matches);
  assert.equal(result.exportedCount, 2);
  assert.equal(result.ineligibleMatches.length, 2);

  // XML should contain official matches
  assert.ok(result.xml.includes('<Result Round="1" PlayerWhiteSNo="1" PlayerBlackSNo="2" Res="1-0" />'));
  assert.ok(result.xml.includes('<Result Round="1" PlayerWhiteSNo="7" PlayerBlackSNo="8" Res="1/2" />'));

  // XML should NOT contain pending or disputed
  assert.ok(!result.xml.includes('PlayerWhiteSNo="3"'));
  assert.ok(!result.xml.includes('PlayerWhiteSNo="5"'));
});

test("generateSwissManagerXml: từ chối ván thiếu mã kỳ thủ và báo cáo lý do cụ thể", () => {
  const matches: ExportableMatch[] = [
    {
      id: "m1",
      round_number: 1,
      board_number: 1,
      status: "official",
      result_code: "1-0",
      result_kind: "normal",
      white_player: { full_name: "Nguyễn An", external_id: null }, // thiếu ID
      black_player: { full_name: "Trần Bình", external_id: "2" },
    },
  ];

  const result = generateSwissManagerXml(matches);
  assert.equal(result.exportedCount, 0);
  assert.equal(result.ineligibleMatches.length, 1);
  assert.match(result.ineligibleMatches[0].reason, /Kỳ thủ chưa có mã Swiss-Manager/);
});

test("generateSwissManagerXml: thực thi đầy đủ 7 điều kiện hợp lệ (chặn bye, unknown ID, unverified identity, sai giải)", () => {
  const matches: ExportableMatch[] = [
    // Gate 2: Bye match -> không xuất XML
    {
      id: "m-bye",
      tournament_id: "t1",
      round_number: 1,
      board_number: 1,
      status: "official",
      result_code: "1-0",
      result_kind: "bye",
      white_player: { full_name: "Nguyễn An", external_id: "1", source_id_type: "swiss_start_rank_no" },
      black_player: null,
    },
    // Gate 3 & 5: source_id_type = unknown (chỉ có tên / không phải mã Swiss-Manager) -> không xuất XML
    {
      id: "m-unknown-id",
      tournament_id: "t1",
      round_number: 1,
      board_number: 2,
      status: "official",
      result_code: "1-0",
      result_kind: "normal",
      white_player: { full_name: "Lê Chi", external_id: "TMP-1", source_id_type: "unknown" },
      black_player: { full_name: "Phạm Dũng", external_id: "TMP-2", source_id_type: "unknown" },
    },
    // Gate 5: is_verified_identity = false -> không xuất XML
    {
      id: "m-unverified",
      tournament_id: "t1",
      round_number: 1,
      board_number: 3,
      status: "official",
      result_code: "0-1",
      result_kind: "normal",
      white_player: { full_name: "Trùng Tên A", external_id: "10", source_id_type: "swiss_start_rank_no", is_verified_identity: false },
      black_player: { full_name: "Kỳ Thủ B", external_id: "11", source_id_type: "swiss_start_rank_no", is_verified_identity: true },
    },
    // Gate 6: Khác tournament_id -> không xuất XML
    {
      id: "m-wrong-tournament",
      tournament_id: "t-other",
      round_number: 1,
      board_number: 4,
      status: "official",
      result_code: "1-0",
      result_kind: "normal",
      white_player: { full_name: "Kỳ Thủ C", external_id: "12", source_id_type: "swiss_start_rank_no" },
      black_player: { full_name: "Kỳ Thủ D", external_id: "13", source_id_type: "swiss_start_rank_no" },
    },
    // Hợp lệ đủ 7 cổng
    {
      id: "m-valid",
      tournament_id: "t1",
      round_number: 1,
      board_number: 5,
      status: "official",
      result_code: "1-0",
      result_kind: "forfeit",
      white_player: { full_name: "Kỳ Thủ E", external_id: "14", source_id_type: "swiss_start_rank_no", is_verified_identity: true },
      black_player: { full_name: "Kỳ Thủ F", external_id: "15", source_id_type: "swiss_start_rank_no", is_verified_identity: true },
    },
  ];

  const result = generateSwissManagerXml(matches, { round: 1, tournamentId: "t1" });
  assert.equal(result.exportedCount, 1);
  assert.equal(result.ineligibleMatches.length, 4);
  assert.ok(result.xml.includes('<Result Round="1" PlayerWhiteSNo="14" PlayerBlackSNo="15" Res="1-0F" />'));
});

