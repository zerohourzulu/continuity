//! Read-only adaptation of full100/v2/source/src/host_io.rs. No output writers.
use std::{ffi::CString, fs::{self, File}, io::{Read, Seek, SeekFrom},
    os::{fd::{AsRawFd, FromRawFd}, unix::{ffi::OsStrExt, fs::MetadataExt}},
    path::{Component, Path, PathBuf}};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Pin { pub path: PathBuf, pub bytes: u64, pub sha256: String }
pub fn require(ok: bool, message: &str) -> Result<()> {
    if ok { Ok(()) } else { Err(message.into()) }
}
pub fn regular(path: &Path) -> Result<File> {
    require(path.is_absolute(), "PATH_NOT_ABSOLUTE")?;
    let parts: Vec<_> = path.components().collect();
    require(parts.len() >= 2 && parts.iter().skip(1).all(|c| matches!(c, Component::Normal(_))), "PATH_COMPONENT_REFUSED")?;
    let root = CString::new("/")?;
    let raw = unsafe { libc::open(root.as_ptr(), libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC) };
    require(raw >= 0, "READ_OPEN")?;
    let mut parent = unsafe { File::from_raw_fd(raw) };
    for (i, part) in parts.iter().enumerate().skip(1) {
        let name = CString::new(part.as_os_str().as_bytes())?;
        let flags = libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK
            | if i + 1 < parts.len() { libc::O_DIRECTORY } else { 0 };
        let raw = unsafe { libc::openat(parent.as_raw_fd(), name.as_ptr(), flags) };
        require(raw >= 0, "READ_OPEN")?;
        parent = unsafe { File::from_raw_fd(raw) };
    }
    let metadata = parent.metadata()?;
    require(metadata.is_file() && metadata.nlink() == 1, "FILE_KIND_REFUSED")?;
    Ok(parent)
}
pub fn stable(a: &fs::Metadata, b: &fs::Metadata) -> Result<()> {
    require(a.dev() == b.dev() && a.ino() == b.ino() && a.len() == b.len()
        && a.mtime() == b.mtime() && a.mtime_nsec() == b.mtime_nsec()
        && a.ctime() == b.ctime() && a.ctime_nsec() == b.ctime_nsec()
        && b.nlink() == 1, "READ_CHANGED")
}
pub fn hash_file(file: &mut File, expected_bytes: u64) -> Result<String> {
    require(expected_bytes > 0 && expected_bytes <= 64 * 1024 * 1024 * 1024, "HASH_SIZE_BOUND")?;
    let mut hash = Sha256::new();
    let mut block = [0_u8; 1024 * 1024];
    let mut remaining = expected_bytes;
    while remaining > 0 {
        let limit = remaining.min(block.len() as u64) as usize;
        let n = file.read(&mut block[..limit])?;
        require(n > 0, "HASH_PREMATURE_EOF")?;
        hash.update(&block[..n]);
        remaining -= n as u64;
    }
    // Append cannot extend hashing work beyond the independently pinned length.
    require(file.read(&mut [0_u8; 1])? == 0, "HASH_TRAILING_BYTES")?;
    Ok(format!("{:x}", hash.finalize()))
}
pub fn verified(pin: &Pin) -> Result<File> {
    require(pin.sha256.len() == 64 && pin.sha256.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)), "PIN_HASH_SHAPE")?;
    require(pin.bytes > 0 && pin.bytes <= 64 * 1024 * 1024 * 1024, "PIN_SIZE_BOUND")?;
    let mut file = regular(&pin.path)?;
    let before = file.metadata()?;
    require(before.len() == pin.bytes, "PIN_SIZE_MISMATCH")?;
    require(hash_file(&mut file, pin.bytes)? == pin.sha256, "PIN_HASH_MISMATCH")?;
    stable(&before, &file.metadata()?)?;
    file.seek(SeekFrom::Start(0))?;
    Ok(file)
}
// Public enrolled source custody only. Positive/private readers remain unchanged.
// An empty source is admitted only after exact empty SHA, EOF and same-fd
// stability checks on the same regular, single-link descriptor.
pub fn verified_source(pin: &Pin) -> Result<File> {
    if pin.bytes > 0 { return verified(pin); }
    require(pin.sha256.len() == 64 && pin.sha256.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)), "PIN_HASH_SHAPE")?;
    require(pin.sha256 == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "PIN_HASH_MISMATCH")?;
    let mut file = regular(&pin.path)?;
    let before = file.metadata()?;
    require(before.len() == 0, "PIN_SIZE_MISMATCH")?;
    require(file.read(&mut [0_u8; 1])? == 0, "HASH_TRAILING_BYTES")?;
    stable(&before, &file.metadata()?)?;
    file.seek(SeekFrom::Start(0))?;
    Ok(file)
}
pub fn bytes(pin: &Pin, cap: u64) -> Result<Vec<u8>> {
    require(pin.bytes <= cap, "INPUT_CAP")?;
    let mut file = verified(pin)?;
    let before = file.metadata()?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file).take(cap.checked_add(1).ok_or("CAP_OVERFLOW")?).read_to_end(&mut bytes)?;
    stable(&before, &file.metadata()?)?;
    require(bytes.len() as u64 == pin.bytes, "INPUT_LENGTH_CHANGED")?;
    require(format!("{:x}", Sha256::digest(&bytes)) == pin.sha256, "INPUT_HASH_CHANGED")?;
    require(file.read(&mut [0_u8; 1])? == 0, "INPUT_TRAILING_BYTES")?;
    Ok(bytes)
}
pub fn json<T: DeserializeOwned>(pin: &Pin, cap: u64) -> Result<T> {
    Ok(serde_json::from_slice(&bytes(pin, cap)?)?)
}
