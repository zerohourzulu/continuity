use native_core::policy::wire;
use serde_json::Value as J;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Refusal { pub category: &'static str, pub code: String }
impl Refusal {
    pub fn as_json(&self)->J { serde_json::json!({"schema":"continuity.r3_1.application-predicate-result.v1","status":"INDETERMINATE","category":self.category,"code":self.code,"permitsExecution":false}) }
}
pub type Result<T> = std::result::Result<T, Refusal>;
pub fn invalid(code: impl Into<String>) -> Refusal { Refusal { category: "INVALID_INPUT", code: code.into() } }
/// Exact public equivalent of native canonical::from_json_data. The native
/// owned-data Deserialize visitor retains its own integer/bigint/reserved-key
/// grammar; measure_bounded then enforces the unchanged canonical bounds.
pub fn owned_core_data(value: J) -> Result<native_core::canonical::Value> {
    let value = serde_json::from_value::<native_core::canonical::Value>(value)
        .map_err(|e| invalid(format!("DATA_PARSE: {e}")))?;
    native_core::canonical::measure_bounded(&value, native_core::canonical::MAX_BYTES)
        .map_err(|e| invalid(e.to_string()))?;
    Ok(value)
}

pub fn unavailable(code: impl Into<String>) -> Refusal { Refusal { category: "UNAVAILABLE", code: code.into() } }
pub fn unsupported(code: impl Into<String>) -> Refusal { Refusal { category: "UNSUPPORTED", code: code.into() } }
pub fn need(condition: bool, code: &str) -> Result<()> { if condition { Ok(()) } else { Err(invalid(code)) } }
pub fn field<'a>(v: &'a J, k: &str) -> Result<&'a J> { wire::field(v,k).map_err(invalid) }
pub fn string(v: &J) -> Result<&str> { wire::string(v).map_err(invalid) }
pub fn s<'a>(v: &'a J, k: &str) -> Result<&'a str> { string(field(v,k)?) }
pub fn number(v: &J) -> Result<u64> { wire::number(v).map_err(invalid) }
pub fn n(v: &J, k: &str) -> Result<u64> { number(field(v,k)?) }
pub fn array(v: &J) -> Result<&[J]> { wire::array(v).map_err(invalid) }
pub fn a<'a>(v: &'a J, k: &str) -> Result<&'a [J]> { array(field(v,k)?) }
pub fn closed(v: &J, keys: &[&str]) -> Result<()> { wire::closed(v,keys).map_err(invalid) }
// Engine canonical ordering is UTF-8, unlike the unchanged legacy P wire's
// UTF-16 fallback for non-ASCII object keys. Never silently reuse that order.
pub fn canonical(v: &J) -> Result<String> {
    fn encode(v:&J,out:&mut String,depth:usize)->Result<()> {
        need(depth<=32,"CANONICAL_DEPTH")?;
        match v {
            J::Null=>out.push_str("null"),J::Bool(v)=>out.push_str(if *v{"true"}else{"false"}),
            J::String(v)=>out.push_str(&serde_json::to_string(v).map_err(|e|invalid(e.to_string()))?),
            J::Number(v)=>{let n=v.as_i64().filter(|n|n.unsigned_abs()<=9_007_199_254_740_991).ok_or_else(||invalid("CANONICAL_INTEGER"))?;out.push_str(&n.to_string());},
            J::Array(v)=>{out.push('[');for(i,v)in v.iter().enumerate(){if i!=0{out.push(',');}encode(v,out,depth+1)?;}out.push(']');},
            J::Object(v)=>{
                let mut keys:Vec<&String>=v.keys().collect();keys.sort_by(|a,b|a.as_bytes().cmp(b.as_bytes()));
                out.push('{');for(i,k)in keys.into_iter().enumerate(){if i!=0{out.push(',');}out.push_str(&serde_json::to_string(k).map_err(|e|invalid(e.to_string()))?);out.push(':');encode(&v[k],out,depth+1)?;}out.push('}');
            },
        } need(out.len()<=super::MAX_INPUT_BYTES,"CANONICAL_BYTES")?;Ok(())
    }
    let mut out=String::new();encode(v,&mut out,0)?;Ok(out)
}
pub fn hash(v: &J) -> Result<String> { Ok(wire::hash_bytes(canonical(v)?.as_bytes())) }
pub fn tagged_digest(domain:&str,v:&J)->Result<String> {
    let mut bytes=Vec::new();bytes.extend_from_slice(domain.as_bytes());bytes.push(0);bytes.extend_from_slice(canonical(v)?.as_bytes());
    Ok(wire::hash_bytes(&bytes))
}
pub fn digest(v: &J) -> Result<&str> { let value=string(v)?; wire::hex(value,32).map_err(invalid)?; Ok(value) }
pub fn text(v: &J) -> Result<&str> {
    let value=string(v)?;
    // Match JS cadence UTF-16 length, while Rust strings already exclude lone surrogates.
    need(!value.is_empty() && value.encode_utf16().count() <= 4096, "TEXT_BOUND")?; Ok(value)
}
pub fn decimal(v: &J, count: bool) -> Result<&str> {
    const MAX: &str="115792089237316195423570985008687907853269984665640564039457584007913129639935";
    let value=string(v)?;
    need(value=="0" || (!value.is_empty() && !value.starts_with('0') && value.bytes().all(|b|b.is_ascii_digit())), "DECIMAL_ENCODING")?;
    need(value.len()<MAX.len() || (value.len()==MAX.len() && value<=MAX), "DECIMAL_U256")?;
    if count { need(value.parse::<u64>().ok().is_some_and(|n|n<=9_007_199_254_740_991), "COUNT_U53")?; }
    Ok(value)
}
pub fn selection(metric: &J, x: &J) -> Result<()> {
    let metric=string(metric)?; need(matches!(metric,"AMOUNT"|"COUNT"),"HEADROOM_METRIC")?;
    decimal(x,metric=="COUNT")?; Ok(())
}
pub fn context(v: &J) -> Result<()> {
    closed(v,&["coreHead","requestDigest","path","cap","count","metric","x","qContextDigest","qTrustPolicyDigest"])?;
    for k in ["coreHead","requestDigest","qContextDigest","qTrustPolicyDigest"] { digest(field(v,k)?)?; }
    text(field(v,"path")?)?; decimal(field(v,"cap")?,false)?; n(v,"count")?;
    selection(field(v,"metric")?,field(v,"x")?)
}

/// Exact canonical Ed25519 DER-SPKI base64 (44 bytes, one padding character).
/// Decode only the independently enrolled key. This creates no new trust role
/// inside Core's CAPTURE/POLICY trust schema.
pub fn spki_hex(v: &J) -> Result<String> {
    const B64: &[u8]=b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let encoded=string(v)?; let bytes=encoded.as_bytes();
    need(bytes.len()==60 && bytes[59]==b'=',"KEY_ENCODING")?;
    let sextet=|b:u8| B64.iter().position(|c|*c==b).map(|n|n as u8).ok_or_else(||invalid("KEY_ENCODING"));
    let mut decoded=Vec::with_capacity(44);
    for (i, chunk) in bytes.chunks_exact(4).enumerate() {
        let a=sextet(chunk[0])?; let b=sextet(chunk[1])?; let c=sextet(chunk[2])?;
        decoded.push((a<<2)|(b>>4)); decoded.push((b<<4)|(c>>2));
        if i==14 { need(chunk[3]==b'=' && c&3==0,"KEY_ENCODING")?; }
        else { decoded.push((c<<6)|sextet(chunk[3])?); }
    }
    let hex=wire::hex_encode(&decoded);
    native_core::policy::public_signatures::spki_bytes(&hex).map_err(invalid)?; Ok(hex)
}
pub fn authenticate(payload: &J, signature: &J, key: &J, domain: &str) -> Result<()> {
    let sig=string(signature)?; wire::hex(sig,64).map_err(invalid)?;
    let message=format!("{domain}\0{}",canonical(payload)?);
    native_core::policy::public_signatures::verify(&spki_hex(key)?,message.as_bytes(),sig)
        .map_err(|_|invalid("SIGNATURE_INVALID"))
}

/// Engine profile's stricter integer input grammar preserves the selected v2
/// canonical signature bytes. Diagnostic precedence is not the JS API claim.
pub fn finite_canonical_wire(input: &str) -> Result<J> {
    need(input.len()<=1_048_576,"ENGINE_BYTES")?;
    let value=wire::parse(input).map_err(invalid)?;
    fn visit(v:&J,depth:usize,nodes:&mut usize)->Result<()> {
        *nodes+=1; need(depth<=12 && *nodes<=20_000,"ENGINE_SHAPE")?;
        match v {
            J::String(s)=>need(s.encode_utf16().count()<=4096,"ENGINE_STRING")?,
            J::Array(values)=>{need(values.len()<=512,"ENGINE_ARRAY")?;for v in values {visit(v,depth+1,nodes)?;}},
            J::Object(values)=>{need(values.len()<=64 && values.keys().all(|k|k.encode_utf16().count()<=80),"ENGINE_OBJECT")?;for v in values.values(){visit(v,depth+1,nodes)?;}},
            J::Number(v)=>need(v.as_i64().is_some_and(|n|n.unsigned_abs()<=9_007_199_254_740_991),"ENGINE_INTEGER")?,
            J::Null|J::Bool(_)=>{},
        } Ok(())
    }
    visit(&value,0,&mut 0)?;
    need(canonical(&value)?==input,"NONCANONICAL_ENGINE_JSON")?; Ok(value)
}
