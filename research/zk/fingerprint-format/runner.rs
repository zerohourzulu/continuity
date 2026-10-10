mod read_io;
use read_io::{Pin, require, Result};
use serde_json::Value;
use std::{fs::OpenOptions, io::Write, path::PathBuf};
fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    require(args.len()==3, "EXACT_PLAN_OUTPUT_ARGUMENTS")?;
    let plan:Value=serde_json::from_slice(&std::fs::read(&args[1])?)?;
    require(plan["status"]=="ROOT_APPROVED_FINGERPRINT_FORMAT_RUN", "EXACT_SELECTED_PLAN")?;
    let fixture_pin:Pin=serde_json::from_value(plan["fixture"].clone())?;
    let bytes=read_io::bytes(&fixture_pin, 16384)?;
    let fixture:Value=serde_json::from_slice(&bytes)?;
    let mut result=guest::fingerprint_format_controls(&fixture)
        .map_err(|r|format!("Unexpected guard/refusal: {}:{}",r.category,r.code))?;
    require(read_io::bytes(&fixture_pin,16384)?==bytes, "FIXTURE_CHANGED")?;
    result["fixture"]=serde_json::to_value(fixture_pin)?;
    let out=PathBuf::from(&args[2]);
    let mut file=OpenOptions::new().write(true).create_new(true).open(out)?;
    file.write_all(serde_json::to_string_pretty(&result)?.as_bytes())?;
    file.write_all(b"\n")?;file.sync_all()?;
    println!("FIVE_NATIVE_FUNCTION_CONTROLS_PASSED");Ok(())
}
