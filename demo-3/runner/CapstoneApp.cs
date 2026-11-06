using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// The visible app owns a kill-on-close Windows job. Its helpers cannot survive
// window closure or a crashed/killed app, even during model startup.
internal sealed class OwnedJob : IDisposable {
    private IntPtr handle;
    [StructLayout(LayoutKind.Sequential)] private struct BasicLimits {
        public long ProcessUserTimeLimit, JobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] private struct IoCounters {
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }
    [StructLayout(LayoutKind.Sequential)] private struct ExtendedLimits {
        public BasicLimits BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern IntPtr CreateJobObject(IntPtr attributes,string name);
    [DllImport("kernel32.dll",SetLastError=true)] private static extern bool SetInformationJobObject(IntPtr job,int infoClass,ref ExtendedLimits limits,uint length);
    [DllImport("kernel32.dll",SetLastError=true)] private static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll",SetLastError=true)] private static extern bool TerminateJobObject(IntPtr job,uint exitCode);
    [DllImport("kernel32.dll",SetLastError=true)] private static extern bool CloseHandle(IntPtr value);
    public OwnedJob() {
        handle=CreateJobObject(IntPtr.Zero,null);
        if(handle==IntPtr.Zero)throw new InvalidOperationException("Could not create the app's process boundary.");
        var limits=new ExtendedLimits();limits.BasicLimitInformation.LimitFlags=0x2000;
        if(!SetInformationJobObject(handle,9,ref limits,(uint)Marshal.SizeOf(typeof(ExtendedLimits)))){Dispose();throw new InvalidOperationException("Could not protect app shutdown. Nothing was started.");}
    }
    public void Assign(Process process){if(!AssignProcessToJobObject(handle,process.Handle))throw new InvalidOperationException("Could not attach the helper to this app. Nothing will run independently.");}
    public void Dispose(){if(handle!=IntPtr.Zero){TerminateJobObject(handle,0);CloseHandle(handle);handle=IntPtr.Zero;}}
}

internal static class CapstonePaths {
    // Repository launchers pass the clone root; older shortcuts pass its parent.
    public static string ResolveRepo(string root){
        string candidate=Path.GetFullPath(root);
        if(File.Exists(Path.Combine(candidate,"demo-3","runner","desktop-host.mjs")))return candidate;
        return Path.Combine(candidate,"app");
    }
    public static string ResolveNode(){
        string configured=Environment.GetEnvironmentVariable("CAPSTONE_NODE_EXECUTABLE");
        if(!String.IsNullOrWhiteSpace(configured))return Path.GetFullPath(configured);
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".cache","codex-runtimes","codex-primary-runtime","dependencies","node","bin","node.exe");
    }
}

internal sealed class CapstoneWindow : Form {
    private readonly string workspace,repo,node,host,connectionPath;
    private readonly JavaScriptSerializer json=new JavaScriptSerializer();
    private readonly Color green=Color.FromArgb(34,85,65),paper=Color.FromArgb(242,246,240),ink=Color.FromArgb(25,55,43);
    private Label powerLabel,stateLabel,detailLabel,connectionLabel,errorLabel,countLabel;
    private Button onButton,offButton,pairButton,websiteButton;
    private TextBox addressBox,codeBox;
    private Process helper;
    private OwnedJob job;
    private string cloudUrl="https://capstone-team2-demo3.capstone-info-492-team-2.workers.dev",operation="",operationId="";
    private bool paired,closing,finalClose;
    private int generation,sequence;
    private System.Windows.Forms.Timer deadline;
    public CapstoneWindow(string workspacePath){
        repo=CapstonePaths.ResolveRepo(workspacePath);workspace=Path.GetDirectoryName(repo);
        node=CapstonePaths.ResolveNode();
        host=Path.Combine(repo,"demo-3","runner","desktop-host.mjs");connectionPath=Path.Combine(repo,".capstone-local","connection.json");
        Text="Capstone Demo 3 — OFF";StartPosition=FormStartPosition.CenterScreen;ClientSize=new Size(760,760);MinimumSize=new Size(730,790);
        BackColor=paper;ForeColor=ink;Font=new Font("Segoe UI",10F);AutoScaleMode=AutoScaleMode.Dpi;
        BuildUi();ReadSavedConnection();ShowOff();FormClosing+=OnAppClosing;
    }
    private Label LabelText(string text,float size,FontStyle style){return new Label{Text=text,AutoSize=true,MaximumSize=new Size(690,0),Font=new Font("Segoe UI",size,style),Margin=new Padding(0,0,0,10),ForeColor=ink};}
    private Button ButtonText(string text,bool primary){var b=new Button{Text=text,Width=166,Height=46,FlatStyle=FlatStyle.Flat,Margin=new Padding(0,0,12,0),BackColor=primary?green:Color.White,ForeColor=primary?Color.White:green,Font=new Font("Segoe UI",11F,FontStyle.Bold)};b.FlatAppearance.BorderColor=green;b.FlatAppearance.BorderSize=1;return b;}
    private void BuildUi(){
        var panel=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,AutoScroll=true,Padding=new Padding(28)};Controls.Add(panel);
        panel.Controls.Add(LabelText("INFO 492  /  TEAM 2  /  DEMO 3",10F,FontStyle.Bold));panel.Controls.Add(LabelText("Capstone desktop",27F,FontStyle.Bold));panel.Controls.Add(LabelText("You decide when this PC processes project documents.",11F,FontStyle.Regular));
        var statusPanel=new FlowLayoutPanel{FlowDirection=FlowDirection.TopDown,WrapContents=false,AutoSize=true,Width=690,Padding=new Padding(20),BackColor=Color.White,Margin=new Padding(0,8,0,18)};
        powerLabel=LabelText("OFF",24F,FontStyle.Bold);statusPanel.Controls.Add(powerLabel);stateLabel=LabelText("No PC processing",13F,FontStyle.Bold);statusPanel.Controls.Add(stateLabel);detailLabel=LabelText("",10F,FontStyle.Regular);detailLabel.MaximumSize=new Size(640,0);statusPanel.Controls.Add(detailLabel);countLabel=LabelText("",9F,FontStyle.Regular);statusPanel.Controls.Add(countLabel);panel.Controls.Add(statusPanel);
        var buttons=new FlowLayoutPanel{AutoSize=true,FlowDirection=FlowDirection.LeftToRight,WrapContents=false,Margin=new Padding(0,0,0,16)};
        onButton=ButtonText("Turn ON",true);onButton.Click+=delegate{TurnOn();};buttons.Controls.Add(onButton);offButton=ButtonText("Turn OFF",false);offButton.Click+=delegate{TurnOff(false);};buttons.Controls.Add(offButton);websiteButton=ButtonText("Open website",false);websiteButton.Click+=delegate{OpenWebsite();};buttons.Controls.Add(websiteButton);panel.Controls.Add(buttons);
        errorLabel=LabelText("",10F,FontStyle.Regular);errorLabel.ForeColor=Color.FromArgb(155,51,35);panel.Controls.Add(errorLabel);connectionLabel=LabelText("",10F,FontStyle.Regular);panel.Controls.Add(connectionLabel);
        panel.Controls.Add(LabelText("Closing this window stops its processing and frees the model's GPU memory.\nOpening it again always starts OFF. It never starts with Windows.",10F,FontStyle.Regular));
        var pairing=new GroupBox{Text="Pairing — remembered on this PC",Width=690,Height=150,Margin=new Padding(0,10,0,10)};
        var urlLabel=LabelText("Capstone website",9F,FontStyle.Regular);urlLabel.Location=new Point(14,27);pairing.Controls.Add(urlLabel);addressBox=new TextBox{Location=new Point(144,24),Width=526};pairing.Controls.Add(addressBox);
        var codeLabel=LabelText("One-time code",9F,FontStyle.Regular);codeLabel.Location=new Point(14,62);pairing.Controls.Add(codeLabel);codeBox=new TextBox{Location=new Point(144,59),Width=320,UseSystemPasswordChar=true,MaxLength=100};pairing.Controls.Add(codeBox);
        pairButton=ButtonText("Save pairing",false);pairButton.Location=new Point(480,55);pairButton.Width=190;pairButton.Height=34;pairButton.Click+=delegate{Pair();};pairing.Controls.Add(pairButton);
        var help=LabelText("Only use a code from Capstone. Saving pairing leaves processing OFF.",9F,FontStyle.Regular);help.Location=new Point(14,108);pairing.Controls.Add(help);panel.Controls.Add(pairing);panel.Controls.Add(LabelText("The website stays online. Queued work waits while this app is OFF or closed.",9F,FontStyle.Regular));
    }
    private void ReadSavedConnection(){
        paired=false;try{var data=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(connectionPath));string candidate=Value(data,"url");Uri uri;if(Uri.TryCreate(candidate,UriKind.Absolute,out uri)&&uri.Scheme=="https"&&uri.Host.EndsWith(".workers.dev",StringComparison.OrdinalIgnoreCase)&&Value(data,"token").Length>20){paired=true;cloudUrl=candidate;}}catch{}
        addressBox.Text=cloudUrl;connectionLabel.Text=paired?"Paired with Capstone • connection saved on this PC.":"Not paired yet. Enter a one-time code from your Capstone website below.";
    }
    private static string Value(Dictionary<string,object> data,string key){object value;return data.TryGetValue(key,out value)&&value!=null?Convert.ToString(value):"";}
    private static bool Flag(Dictionary<string,object> data,string key){object value;return data.TryGetValue(key,out value)&&value is bool&&(bool)value;}
    private void ShowOff(){Text="Capstone Demo 3 — OFF";powerLabel.Text="OFF";powerLabel.ForeColor=Color.FromArgb(95,109,102);stateLabel.Text="No PC processing";detailLabel.Text="AI processing and website checks are stopped. Click Turn ON when you want to run the demo.";onButton.Enabled=paired&&!closing;offButton.Enabled=false;pairButton.Enabled=!closing;addressBox.Enabled=!closing;codeBox.Enabled=!closing;}
    private void StartHost(){
        if(helper!=null)throw new InvalidOperationException("Wait for the current action to finish.");if(!File.Exists(node)||!File.Exists(host))throw new InvalidOperationException("The Capstone app files or Node runtime are missing.");job=new OwnedJob();
        var start=new ProcessStartInfo(node,"\""+host+"\""){WorkingDirectory=repo,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=new UTF8Encoding(false),StandardErrorEncoding=new UTF8Encoding(false)};start.EnvironmentVariables["CAPSTONE_DESKTOP_MANAGED"]="1";
        helper=new Process{StartInfo=start,EnableRaisingEvents=true};int current=++generation;
        helper.OutputDataReceived+=delegate(object sender,DataReceivedEventArgs e){if(e.Data!=null)Dispatch(delegate{if(current==generation)Receive(e.Data);});};helper.ErrorDataReceived+=delegate{};
        helper.Exited+=delegate{Dispatch(delegate{if(current==generation&&helper!=null){EndHost();if(!closing){errorLabel.Text="Processing stopped. The app closed its helper processes.";ShowOff();}else FinishClose();}});};
        try{if(!helper.Start())throw new InvalidOperationException("The Capstone helper did not start.");job.Assign(helper);helper.StandardInput.AutoFlush=true;helper.BeginOutputReadLine();helper.BeginErrorReadLine();}catch{try{if(helper!=null&&!helper.HasExited)helper.Kill();}catch{}EndHost();throw;}
    }
    private void Dispatch(Action action){if(!IsDisposed&&IsHandleCreated)try{BeginInvoke(action);}catch(InvalidOperationException){}}
    private void Send(string command,Dictionary<string,object> extra){operationId=(++sequence).ToString();var payload=extra??new Dictionary<string,object>();payload["id"]=operationId;payload["command"]=command;helper.StandardInput.WriteLine(json.Serialize(payload));}
    private void ArmDeadline(int milliseconds,Action action){ClearDeadline();deadline=new System.Windows.Forms.Timer{Interval=milliseconds};deadline.Tick+=delegate{ClearDeadline();action();};deadline.Start();}
    private void ClearDeadline(){if(deadline!=null){deadline.Stop();deadline.Dispose();deadline=null;}}
    private void TurnOn(){
        if(operation!=""||helper!=null||!paired)return;errorLabel.Text="";operation="on";onButton.Enabled=false;pairButton.Enabled=false;addressBox.Enabled=false;codeBox.Enabled=false;offButton.Enabled=true;powerLabel.Text="STARTING";stateLabel.Text="Starting the local demo";detailLabel.Text="You can turn it OFF or close this window at any time.";Text="Capstone Demo 3 — STARTING";
        try{StartHost();Send("on",null);ArmDeadline(60000,delegate{EndHost();errorLabel.Text="Startup took too long. Everything started by this app has been stopped.";ShowOff();});}catch(Exception e){EndHost();errorLabel.Text=e.Message;ShowOff();}
    }
    private void TurnOff(bool close){
        if(close)closing=true;if(helper==null){ShowOff();if(close)FinishClose();return;}operation="off";onButton.Enabled=false;offButton.Enabled=false;pairButton.Enabled=false;powerLabel.Text="STOPPING";stateLabel.Text="Stopping processing and releasing the model";Text="Capstone Demo 3 — STOPPING";
        try{Send("off",null);ArmDeadline(4000,delegate{EndHost();ShowOff();if(closing)FinishClose();});}catch{EndHost();ShowOff();if(closing)FinishClose();}
    }
    private void Pair(){
        if(helper!=null||operation!=""||closing)return;if(String.IsNullOrWhiteSpace(codeBox.Text)){errorLabel.Text="Enter a one-time pairing code from the website.";return;}operation="pair";errorLabel.Text="";onButton.Enabled=false;pairButton.Enabled=false;stateLabel.Text="Saving pairing — processing remains OFF";
        try{StartHost();Send("pair",new Dictionary<string,object>{{"url",addressBox.Text.Trim()},{"code",codeBox.Text.Trim()}});codeBox.Clear();ArmDeadline(30000,delegate{EndHost();errorLabel.Text="Pairing timed out. No model was started.";ShowOff();});}catch(Exception e){EndHost();errorLabel.Text=e.Message;ShowOff();}
    }
    private void Receive(string line){
        try{var data=json.Deserialize<Dictionary<string,object>>(line);
            if(Value(data,"type")=="status"){
                if(operation=="off"||closing)return;string power=Value(data,"power");
                if(power=="on"){Text="Capstone Demo 3 — ON";powerLabel.Text="ON";powerLabel.ForeColor=green;stateLabel.Text=Value(data,"stage");detailLabel.Text="Processing is enabled. Turn OFF or close this window to stop.";offButton.Enabled=true;}
                if(power=="starting")stateLabel.Text=Value(data,"stage");
                if(power=="stopping"){Text="Capstone Demo 3 — STOPPING";powerLabel.Text="STOPPING";stateLabel.Text=Value(data,"stage");detailLabel.Text="Stopping its local processes and releasing the model.";onButton.Enabled=false;pairButton.Enabled=false;offButton.Enabled=true;}
                if(power=="off"&&operation==""){EndHost();ShowOff();}if(Value(data,"lastError")!="")errorLabel.Text=Value(data,"lastError");if(Value(data,"completed")!="")countLabel.Text="Completed this run: "+Value(data,"completed");return;
            }
            if(Value(data,"id")!=operationId)return;string completedOperation=operation;ClearDeadline();
            if(!Flag(data,"ok")){errorLabel.Text=Value(data,"error");EndHost();ShowOff();if(closing)FinishClose();return;}
            if(completedOperation=="on"){operation="";Text="Capstone Demo 3 — ON";powerLabel.Text="ON";powerLabel.ForeColor=green;stateLabel.Text="Ready for queued document batches";offButton.Enabled=true;}
            if(completedOperation=="off"){EndHost();ShowOff();if(closing)FinishClose();}if(completedOperation=="pair"){EndHost();ReadSavedConnection();ShowOff();errorLabel.Text="Pairing saved. Processing is OFF.";}
        }catch{EndHost();errorLabel.Text="The local helper returned an invalid response. Processing has stopped.";ShowOff();if(closing)FinishClose();}
    }
    private void EndHost(){++generation;ClearDeadline();operation="";operationId="";if(job!=null){job.Dispose();job=null;}if(helper!=null){try{helper.Dispose();}catch{}helper=null;}}
    private void OpenWebsite(){try{var url=new Uri(cloudUrl);if(url.Scheme!="https"||!url.Host.EndsWith(".workers.dev",StringComparison.OrdinalIgnoreCase))throw new Exception();Process.Start(new ProcessStartInfo(url.AbsoluteUri){UseShellExecute=true});}catch{errorLabel.Text="The Capstone website address is unavailable.";}}
    private void OnAppClosing(object sender,FormClosingEventArgs e){if(finalClose)return;e.Cancel=true;if(!closing)TurnOff(true);}
    private void FinishClose(){EndHost();finalClose=true;Close();}
    protected override void Dispose(bool disposing){if(disposing)EndHost();base.Dispose(disposing);}
}
internal static class Program {
    [STAThread] private static void Main(string[] args){bool first;using(var single=new Mutex(true,"Local\\CapstoneDemo3ManualDesktop",out first)){if(!first){MessageBox.Show("The Capstone app is already open. Use its ON / OFF controls.","Capstone Demo 3");return;}Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);string workspace=args.Length>0?args[0]:Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..","..",".."));try{using(var window=new CapstoneWindow(workspace)){Application.Run(window);}}catch(Exception e){MessageBox.Show("Capstone stopped: "+e.Message,"Capstone Demo 3",MessageBoxButtons.OK,MessageBoxIcon.Error);}}}
}
