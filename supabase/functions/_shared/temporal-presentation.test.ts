import {assertEquals} from "jsr:@std/assert@1";
import {presentZonedDateTime,presentZonedRange} from "./temporal-presentation.ts";

Deno.test("Berlin DST presentation converts UTC to canonical local summer time",()=>{
  assertEquals(presentZonedDateTime("2026-10-05T13:00:00Z","Europe/Berlin"),{
    iso:"2026-10-05T13:00:00Z",
    date:"2026-10-05",
    time:"15:00",
    timezone:"Europe/Berlin"
  });
  assertEquals(presentZonedRange("2026-10-05T13:00:00Z","2026-10-05T15:30:00Z","Europe/Berlin"),{
    local_date:"2026-10-05",
    local_start_time:"15:00",
    local_end_time:"17:30",
    timezone:"Europe/Berlin",
    display_time:"15:00–17:30",
    crosses_local_date:false
  });
});

Deno.test("Berlin winter presentation respects standard time",()=>{
  assertEquals(presentZonedDateTime("2026-12-05T13:00:00Z","Europe/Berlin").time,"14:00");
});

Deno.test("all-day events never expose misleading clock time",()=>{
  assertEquals(presentZonedRange("2026-10-05T00:00:00Z","2026-10-06T00:00:00Z","Europe/Berlin",true).display_time,"Todo el día");
});
