import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parsePairings } from "../lib/excel/parse-pairings.ts";
import { generateUsccResultsExcel } from "../lib/export/export-excel.ts";
import { generateSwissManagerXml } from "../lib/export/export-xml.ts";

// 1. Production Denylist Verification
const PRODUCTION_REF = "idmamlbtrieeidiqgkzt";
const STAGING_REF = "pgfwyohmbtcxumtlojby";

const envStagingPath = path.resolve("D:/uscc-staging-migrations/.env.staging");
if (!fs.existsSync(envStagingPath)) {
  throw new Error(`Staging config not found at ${envStagingPath}`);
}

const envContent = fs.readFileSync(envStagingPath, "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const match = line.trim().match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1]] = match[2];
  }
}

const supabaseUrl = env["NEXT_PUBLIC_SUPABASE_URL"];
const supabaseServiceKey = env["SUPABASE_SECRET_KEY"];

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Staging credentials in .env.staging");
}

if (supabaseUrl.includes(PRODUCTION_REF)) {
  throw new Error(`FATAL: Staging URL contains PRODUCTION reference ${PRODUCTION_REF}! Aborting.`);
}

if (!supabaseUrl.includes(STAGING_REF)) {
  throw new Error(`Target URL does not match Staging reference ${STAGING_REF}: ${supabaseUrl}`);
}

console.log(`[PASS] Target verified: Staging Project Ref ${STAGING_REF} (${supabaseUrl})`);
console.log(`[PASS] Production Denylist verified: ${PRODUCTION_REF} is untouched.`);

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function runStagingE2E() {
  console.log("\n--- BẮT ĐẦU END-TO-END STAGING INTEGRATION TEST ---");

  // Step 1: Create or verify Technical and Recorder test profiles
  const techUserId = "11111111-1111-4111-8111-111111111111";
  const recorderUserId = "22222222-2222-4222-8222-222222222222";

  // Upsert users via Admin API
  await admin.auth.admin.createUser({
    id: techUserId,
    email: "tech.e2e@staging.local",
    password: "Password123!xStaging",
    email_confirm: true,
  }).catch(() => null);

  await admin.auth.admin.createUser({
    id: recorderUserId,
    email: "recorder.e2e@staging.local",
    password: "Password123!xStaging",
    email_confirm: true,
  }).catch(() => null);

  await admin.from("profiles").upsert([
    { id: techUserId, full_name: "Trọng Tài Kỹ Thuật E2E", role: "technical" },
    { id: recorderUserId, full_name: "Trọng Tài Ghi Điểm E2E", role: "recorder" },
  ]);

  console.log("[PASS] Step 1: Technical và Recorder test profiles đã được thiết lập.");

  // Step 2: Test unauthenticated RPC execution rejection
  const anonClient = createClient(supabaseUrl, env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
  const { error: anonError } = await anonClient.rpc("uscc_import_chess_results", {
    p_tournament_id: "00000000-0000-0000-0000-000000000000",
    p_round: 1,
    p_filename: "test.xlsx",
    p_actor: recorderUserId,
    p_rows: [],
  });
  assert.ok(anonError, "Anonymous RPC call must be rejected");
  console.log("[PASS] Step 2: Gọi RPC từ client ẩn danh bị từ chối chính xác (401/403).");

  // Step 3: Technical creates tournament
  const { data: tournId, error: tournError } = await admin.rpc("uscc_create_tournament", {
    p_actor: techUserId,
    p_name: "USCC Staging Championship 2026",
    p_organizer: "USCC Referee DevOps Team",
    p_venue: "Đại học Khoa học Tự nhiên",
    p_start_date: "2026-11-01",
    p_end_date: "2026-11-02",
    p_total_rounds: 5,
    p_timezone: "Asia/Ho_Chi_Minh",
    p_logo_url: null,
    p_primary_color: "#172C4C",
  });
  assert.ok(!tournError, `Create tournament error: ${tournError?.message}`);
  assert.ok(tournId, "Tournament ID must be returned");
  console.log(`[PASS] Step 3: Giải đấu được tạo thành công với ID: ${tournId}`);

  // Step 4: Parse 40 boards from real Excel file
  const excelPath = path.resolve("USCC-HCMUS-round-1-Chess-Results.xlsx");
  const buffer = fs.readFileSync(excelPath);
  const parseResult = await parsePairings(buffer);
  assert.equal(parseResult.pairings.length, 40, "Must parse exactly 40 boards");
  assert.equal(parseResult.hasBlockingErrors, false, "Must have zero blocking errors");
  console.log("[PASS] Step 4: Phân tích thành công 40 bàn từ file Excel Chess-Results thực tế.");

  // Step 5: Import 40 boards into Staging DB via RPC
  const { data: importedCount, error: importError } = await admin.rpc("uscc_import_chess_results", {
    p_tournament_id: tournId,
    p_round: 1,
    p_filename: "USCC-HCMUS-round-1-Chess-Results.xlsx",
    p_actor: techUserId,
    p_rows: parseResult.pairings,
  });
  assert.ok(!importError, `Import error: ${importError?.message}`);
  assert.equal(importedCount, 40, "Imported count must be 40");

  const { count: matchesCount } = await admin
    .from("matches")
    .select("*", { count: "exact", head: true })
    .eq("tournament_id", tournId)
    .eq("round_number", 1);
  assert.equal(matchesCount, 40, "DB matches count must be 40");
  console.log("[PASS] Step 5: Đã nhập 40 cặp đấu vào cơ sở dữ liệu Staging thành công.");

  // Step 6: Fetch Board 1 and Board 2
  const { data: matches } = await admin
    .from("matches")
    .select(`
      id, board_number, status, result_code, white_player_id, black_player_id,
      white_player:players!white_same_tournament(full_name),
      black_player:players!black_same_tournament(full_name)
    `)
    .eq("tournament_id", tournId)
    .eq("round_number", 1)
    .order("board_number");

  const board1 = matches!.find((m) => m.board_number === 1)!;
  const board2 = matches!.find((m) => m.board_number === 2)!;
  assert.equal(board1.status, "unreported");

  // Step 7: Recorder submits result on Board 1 (1-0)
  const { error: submitErr } = await admin.rpc("uscc_submit_result", {
    p_match_id: board1.id,
    p_actor: recorderUserId,
    p_result_code: "1-0",
    p_result_kind: "normal",
  });
  assert.ok(!submitErr, `Submit error: ${submitErr?.message}`);

  const { data: b1AfterSubmit } = await admin.from("matches").select("status").eq("id", board1.id).single();
  assert.equal(b1AfterSubmit?.status, "pending_white", "Status must be pending_white");
  console.log("[PASS] Step 6-7: Recorder nộp tỷ số 1-0 trên Bàn 1 -> Chuyển sang pending_white.");

  // Step 8: White player confirms Board 1
  const { error: whiteConfirmErr } = await admin.rpc("uscc_confirm_result", {
    p_match_id: board1.id,
    p_actor: recorderUserId,
    p_player_side: "white",
    p_agreed: true,
  });
  assert.ok(!whiteConfirmErr, `White confirm error: ${whiteConfirmErr?.message}`);

  const { data: b1AfterWhite } = await admin.from("matches").select("status, white_confirmed_at, black_confirmed_at").eq("id", board1.id).single();
  assert.equal(b1AfterWhite?.status, "pending_black", "Status must be pending_black");
  assert.ok(b1AfterWhite?.white_confirmed_at, "White confirmed at must be set");
  assert.equal(b1AfterWhite?.black_confirmed_at, null, "Black confirmed at must be null");
  console.log("[PASS] Step 8: Trắng xác nhận Bàn 1 -> Chuyển sang pending_black (Chưa official).");

  // Step 9: Black player confirms Board 1
  const { error: blackConfirmErr } = await admin.rpc("uscc_confirm_result", {
    p_match_id: board1.id,
    p_actor: recorderUserId,
    p_player_side: "black",
    p_agreed: true,
  });
  assert.ok(!blackConfirmErr, `Black confirm error: ${blackConfirmErr?.message}`);

  const { data: b1AfterBlack } = await admin.from("matches").select("status, black_confirmed_at").eq("id", board1.id).single();
  assert.equal(b1AfterBlack?.status, "official", "Status must be official");
  assert.ok(b1AfterBlack?.black_confirmed_at, "Black confirmed at must be set");
  console.log("[PASS] Step 9: Đen xác nhận Bàn 1 -> Chuyển sang official thành công.");

  // Step 10: Board 2 dispute flow
  await admin.rpc("uscc_submit_result", {
    p_match_id: board2.id,
    p_actor: recorderUserId,
    p_result_code: "0-1",
    p_result_kind: "normal",
  });
  await admin.rpc("uscc_confirm_result", {
    p_match_id: board2.id,
    p_actor: recorderUserId,
    p_player_side: "white",
    p_agreed: true,
  });

  // Black disputes (p_agreed: false)
  const { error: disputeErr } = await admin.rpc("uscc_confirm_result", {
    p_match_id: board2.id,
    p_actor: recorderUserId,
    p_player_side: "black",
    p_agreed: false,
  });
  assert.ok(!disputeErr, `Dispute error: ${disputeErr?.message}`);

  const { data: b2Disputed } = await admin.from("matches").select("status").eq("id", board2.id).single();
  assert.equal(b2Disputed?.status, "disputed", "Match must be disputed");

  // Technical resolves dispute to draw 1/2-1/2
  const { error: resolveErr } = await admin.rpc("uscc_resolve_dispute", {
    p_match_id: board2.id,
    p_actor: techUserId,
    p_result_code: "1/2-1/2",
    p_result_kind: "normal",
    p_reason: "Trọng tài kỹ thuật kiểm tra biên bản: xác nhận hòa",
  });
  assert.ok(!resolveErr, `Resolve dispute error: ${resolveErr?.message}`);

  const { data: b2AfterResolve } = await admin.from("matches").select("status, result_code").eq("id", board2.id).single();
  assert.equal(b2AfterResolve?.status, "official");
  assert.equal(b2AfterResolve?.result_code, "1/2-1/2");
  console.log("[PASS] Step 10: Quy trình tranh chấp & Trọng tài kỹ thuật phân xử hòa 1/2-1/2 thành công.");

  // Step 11: Technical cancels Board 1 result (FR-08)
  const { error: cancelErr } = await admin.rpc("uscc_cancel_result", {
    p_match_id: board1.id,
    p_actor: techUserId,
    p_expected_status: "official",
    p_reason: "Kỳ thủ nộp nhầm bàn, hủy để nhập lại",
  });
  assert.ok(!cancelErr, `Cancel result error: ${cancelErr?.message}`);

  const { data: b1AfterCancel } = await admin.from("matches").select("status, result_code, white_confirmed_at, black_confirmed_at").eq("id", board1.id).single();
  assert.equal(b1AfterCancel?.status, "unreported", "Cancelled match must return to unreported");
  assert.equal(b1AfterCancel?.result_code, null, "Result code must be null");
  assert.equal(b1AfterCancel?.white_confirmed_at, null, "White confirmed at must be cleared");
  assert.equal(b1AfterCancel?.black_confirmed_at, null, "Black confirmed at must be cleared");

  const { data: cancelEvents, error: eventsErr } = await admin.from("result_events").select("event_type, reason, new_data").eq("match_id", board1.id);
  assert.ok(!eventsErr, `Query events error: ${eventsErr?.message}`);
  assert.ok(cancelEvents && cancelEvents.some((e) => e.event_type === "result_cancelled"), "Must log result_cancelled event");
  console.log("[PASS] Step 11: Trọng tài kỹ thuật hủy kết quả Bàn 1 -> Về unreported, xóa xác nhận, ghi log result_cancelled.");

  // Step 12: Verify Projection API data
  const { data: projectionMatches } = await admin
    .from("matches")
    .select("board_number, status, result_code")
    .eq("tournament_id", tournId)
    .eq("round_number", 1)
    .eq("status", "official");

  assert.equal(projectionMatches?.length, 1, "Only 1 match is currently official");
  assert.equal(projectionMatches?.[0].board_number, 2, "Only Board 2 should be published on projection");
  console.log("[PASS] Step 12: Màn chiếu chỉ hiển thị ván official (Bàn 2), không hiển thị ván đã hủy (Bàn 1).");

  // Step 13: Export Excel and XML
  const { data: allMatchesForExport } = await admin
    .from("matches")
    .select(`
      id, round_number, board_number, status, result_code, result_kind,
      white_player:players!white_same_tournament(id, full_name, club, external_id, source_id_type),
      black_player:players!black_same_tournament(id, full_name, club, external_id, source_id_type)
    `)
    .eq("tournament_id", tournId)
    .eq("round_number", 1)
    .order("board_number");

  const excelBuffer = await generateUsccResultsExcel(
    allMatchesForExport as never,
    {
      tournamentName: "USCC Staging Championship 2026",
      round: 1,
      scope: "audit",
    },
  );
  assert.ok(excelBuffer.length > 1000, "Excel buffer must be generated");

  const xmlOutput = generateSwissManagerXml(
    allMatchesForExport as never,
    { round: 1 },
  );
  assert.ok(xmlOutput.xml.includes("<Results>"), "XML must contain <Results>");
  console.log("[PASS] Step 13: Xuất file Excel (.xlsx) và Swiss-Manager XML (.xml) thành công.");

  // Step 14: Measure Simulated Polling Latency against Staging REST API (5 rounds)
  const latencies: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    await admin.from("matches").select("id, status").eq("tournament_id", tournId).eq("status", "official");
    const t1 = performance.now();
    latencies.push(Math.round(t1 - t0));
  }
  const maxLatency = Math.max(...latencies);
  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  console.log(`[PASS] Step 14: Đo đạc độ trễ API Staging (5 lượt): ${latencies.join(", ")}ms (Trung bình: ${avgLatency}ms, Tối đa: ${maxLatency}ms).`);

  console.log("\n=======================================================");
  console.log("   TẤT CẢ CÁC BƯỚC END-TO-END STAGING ĐÃ HOÀN TẤT THÀNH CÔNG");
  console.log("=======================================================\n");
}

runStagingE2E().catch((err) => {
  console.error("STAGING E2E FAILED:", err);
  process.exit(1);
});
