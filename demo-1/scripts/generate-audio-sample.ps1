# Synthetic, single-speaker smoke test. Uses an installed Windows offline voice.
param([string]$OutputFile = "$PSScriptRoot/../data/synthetic-introduction.wav")
Add-Type -AssemblyName System.Speech
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.Rate = -1
$voice.SetOutputToWaveFile([System.IO.Path]::GetFullPath($OutputFile))
$voice.Speak("My name is Maya and I'm the general contractor. This is a fictional construction meeting. We decided to keep the east corridor closed until the moisture results are reviewed. I will send the revised access plan by Friday. Luis will photograph the damaged floor by Thursday. The adhesive specification is still unresolved. Who is responsible for hauling away the concrete? No owner has been assigned. These notes need human review.")
$voice.Dispose()
Write-Output "Created synthetic audio at $OutputFile"
