# Run by app.cmd: asks which project folder to work in, then opens Salieri there, in the portable Git Bash.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$remember = "$root\.last-folder"   # the folder picked last time, so the dialog starts there

# Windows' own "Select folder" dialog (IFileOpenDialog with FOS_PICKFOLDERS). Only the vtable slots
# up to GetResult matter; the ones never called are declared without their real parameters.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FolderPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class FileOpenDialog {}
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(); void SetFileTypeIndex(); void GetFileTypeIndex(); void Advise(); void Unadvise();
    void SetOptions(uint fos); void GetOptions(out uint fos);
    void SetDefaultFolder(IShellItem si); void SetFolder(IShellItem si);
    void GetFolder(); void GetCurrentSelection(); void SetFileName(); void GetFileName();
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void SetFileNameLabel();
    void GetResult(out IShellItem si);
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(); void GetParent();
    void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr bc, [MarshalAs(UnmanagedType.LPStruct)] Guid iid, out IShellItem si);

  public static string Pick(string title, string start) {
    var d = (IFileDialog)new FileOpenDialog();
    d.SetOptions(0x20 | 0x40);   // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM
    d.SetTitle(title);
    d.SetOkButtonLabel("Open in Salieri");
    if (start != null) {
      IShellItem si;
      try { SHCreateItemFromParsingName(start, IntPtr.Zero, typeof(IShellItem).GUID, out si); d.SetFolder(si); } catch {}
    }
    if (d.Show(IntPtr.Zero) != 0) return null;   // cancelled
    IShellItem result; string path;
    d.GetResult(out result);
    result.GetDisplayName(0x80058000, out path);   // SIGDN_FILESYSPATH
    return path;
  }
}
'@

$start = $env:USERPROFILE
if (Test-Path $remember) {
  $last = (Get-Content -Raw $remember).Trim()
  if ($last -and (Test-Path -PathType Container $last)) { $start = $last }
}
$folder = [FolderPicker]::Pick('Salieri: choose the project folder to work in', $start)
if (-not $folder) { exit }
Set-Content -Encoding UTF8 $remember $folder

# What git-bash.exe does, plus -c for our look (scripts\mintty.conf). --hold error: if salieri
# fails (e.g. the model is missing), the window stays open so the message can be read.
$env:MSYSTEM = 'MINGW64'
$git = "$root\runtime\git"
Start-Process -WorkingDirectory $folder -FilePath "$git\usr\bin\mintty.exe" -ArgumentList (
  "-c `"$root\scripts\mintty.conf`" -i `"$git\mingw64\share\git\git-for-windows.ico`" " +
  "-t Salieri --hold error /usr/bin/bash --login -c salieri")
