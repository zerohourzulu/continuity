//! Durable source-proposed carriers. Exclusive output, never overwrites old bytes.
use std::{fs::{self,File,OpenOptions},io::Write,os::unix::fs::{DirBuilderExt,OpenOptionsExt},path::{Path,PathBuf}};
use sha2::{Digest,Sha256};
use crate::read_io::{Pin,Result,require,regular,stable,hash_file};

pub struct Journal { root:PathBuf, next:u32 }
impl Journal {
 pub fn new(root:&Path)->Result<Self> {
    require(root.is_absolute() && root.components().all(|c|matches!(c,std::path::Component::RootDir|std::path::Component::Normal(_))),"OUTPUT_PATH")?;
    for p in root.parent().ok_or("OUTPUT_PARENT")?.ancestors() {
       let m=fs::symlink_metadata(p)?;require(m.is_dir()&&!m.file_type().is_symlink(),"OUTPUT_PARENT_SYMLINK")?;
    }
    fs::DirBuilder::new().mode(0o700).create(root)?;
    File::open(root.parent().ok_or("OUTPUT_PARENT")?)?.sync_all()?;
    Ok(Self{root:root.to_owned(),next:0})
 }
 pub fn save(&self,name:&str,raw:&[u8],cap:usize)->Result<Pin> {
    require(!name.is_empty() && !name.contains('/') && raw.len()<=cap,"OUTPUT_CAP_OR_NAME")?;
    let path=self.root.join(name);
    let mut f=OpenOptions::new().write(true).create_new(true).mode(0o600).custom_flags(libc::O_NOFOLLOW).open(&path)?;
    f.write_all(raw)?;f.sync_all()?;File::open(&self.root)?.sync_all()?;
    let mut check=regular(&path)?;let before=check.metadata()?;require(before.len()==raw.len() as u64,"OUTPUT_SIZE_CHANGED")?;
    let actual=hash_file(&mut check,before.len())?;stable(&before,&check.metadata()?)?;
    require(actual==format!("{:x}",Sha256::digest(raw)),"OUTPUT_READBACK_HASH_CHANGED")?;
    Ok(Pin{path,bytes:before.len(),sha256:actual})
 }
 pub fn event(&mut self,value:&serde_json::Value)->Result<Pin> {
    let name=format!("EVENT-{:04}.json",self.next);self.next=self.next.checked_add(1).ok_or("JOURNAL_COUNT")?;
    self.save(&name,&serde_json::to_vec_pretty(value)?,1<<20)
 }
}
