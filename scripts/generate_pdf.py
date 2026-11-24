import re
import os
import subprocess
import markdown_it

def generate_pdf():
    doc_path = "/home/raju/Desktop/Major_Project/DOCUMENTATION.md"
    html_path = "/tmp/CLABTOPro_Documentation.html"
    pdf_out_dir = "/home/raju/Desktop/Major_Project"
    final_pdf_path = os.path.join(pdf_out_dir, "CLABTOPro_Documentation.pdf")

    with open(doc_path, "r", encoding="utf-8") as f:
        md_text = f.read()

    # SVG 1: System Architecture Diagram
    svg_arch = '''
    <div class="diagram-wrapper">
      <div class="diagram-title">Figure 2.1: ClabToPro End-to-End System Architecture</div>
      <svg viewBox="0 0 880 430" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <!-- Defs for arrows and gradients -->
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#475569" />
          </marker>
          <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#2563eb" />
          </marker>
          <marker id="arrow-green" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#16a34a" />
          </marker>
          <filter id="shadow" x="-5%" y="-5%" width="110%" height="115%" filterUnits="userSpaceOnUse">
            <feDropShadow dx="1" dy="2" stdDeviation="2" flood-opacity="0.08"/>
          </filter>
        </defs>

        <!-- Subgraph: Client Tier -->
        <rect x="20" y="20" width="220" height="390" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />
        <rect x="20" y="20" width="220" height="34" rx="8" fill="#e2e8f0" />
        <text x="35" y="42" font-size="13" font-weight="bold" fill="#1e293b">Client Tier (React 18 + Vite)</text>
        
        <rect x="35" y="70" width="190" height="60" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1" filter="url(#shadow)"/>
        <text x="45" y="93" font-size="12" font-weight="bold" fill="#0f172a">Student Practice Portal</text>
        <text x="45" y="112" font-size="10" fill="#64748b">Problem Library • Streaks • AI Hint</text>

        <rect x="35" y="150" width="190" height="65" rx="6" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5" filter="url(#shadow)"/>
        <text x="45" y="173" font-size="12" font-weight="bold" fill="#1d4ed8">Student Exam Session</text>
        <text x="45" y="190" font-size="10" fill="#2563eb">Paper Notepad (50% Gate)</text>
        <text x="45" y="204" font-size="10" fill="#64748b">Exam Monaco (No IntelliSense)</text>

        <rect x="35" y="235" width="190" height="70" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1" filter="url(#shadow)"/>
        <text x="45" y="258" font-size="12" font-weight="bold" fill="#0f172a">Faculty Exam Management</text>
        <text x="45" y="275" font-size="10" fill="#64748b">Bulk PDF Question Ingestion</text>
        <text x="45" y="291" font-size="10" fill="#64748b">Live Telemetry & Proctoring</text>

        <rect x="35" y="325" width="190" height="65" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1" filter="url(#shadow)"/>
        <text x="45" y="348" font-size="12" font-weight="bold" fill="#0f172a">Security & Proctoring</text>
        <text x="45" y="365" font-size="10" fill="#64748b">Blur / Fullscreen / Tab Audit</text>

        <!-- Subgraph: API Gateway -->
        <rect x="280" y="20" width="220" height="390" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />
        <rect x="280" y="20" width="220" height="34" rx="8" fill="#e2e8f0" />
        <text x="295" y="42" font-size="13" font-weight="bold" fill="#1e293b">API Gateway (Express / Node)</text>

        <rect x="295" y="70" width="190" height="50" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1" filter="url(#shadow)"/>
        <text x="305" y="93" font-size="11" font-weight="bold" fill="#0f172a">JWT Auth & Role Guard</text>
        <text x="305" y="108" font-size="10" fill="#64748b">Student vs Admin Middleware</text>

        <rect x="295" y="135" width="190" height="50" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1" filter="url(#shadow)"/>
        <text x="305" y="158" font-size="11" font-weight="bold" fill="#0f172a">Rate Limiting & Queue</text>
        <text x="305" y="173" font-size="10" fill="#64748b">Submission Concurrency Control</text>

        <rect x="295" y="200" width="190" height="60" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1" filter="url(#shadow)"/>
        <text x="305" y="222" font-size="11" font-weight="bold" fill="#0f172a">Exam Allocation Engine</text>
        <text x="305" y="238" font-size="10" fill="#64748b">Fisher-Yates 1-to-1 Mapping</text>
        <text x="305" y="251" font-size="10" fill="#64748b">Zero Shared Questions</text>

        <rect x="295" y="275" width="190" height="60" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1" filter="url(#shadow)"/>
        <text x="305" y="297" font-size="11" font-weight="bold" fill="#0f172a">Bulk Ingestion Parser</text>
        <text x="305" y="313" font-size="10" fill="#64748b">Page Header/Footer Stripping</text>
        <text x="305" y="326" font-size="10" fill="#64748b">Pattern & Matrix Classifier</text>

        <rect x="295" y="350" width="190" height="45" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1" filter="url(#shadow)"/>
        <text x="305" y="370" font-size="11" font-weight="bold" fill="#0f172a">Express REST Routes</text>
        <text x="305" y="384" font-size="9" fill="#64748b">/api/exams, /api/submissions, etc.</text>

        <!-- Subgraph: Execution & AI / Data Tier -->
        <rect x="540" y="20" width="320" height="390" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />
        <rect x="540" y="20" width="320" height="34" rx="8" fill="#e2e8f0" />
        <text x="555" y="42" font-size="13" font-weight="bold" fill="#1e293b">Judge, AI & Persistence Services</text>

        <!-- Execution engine -->
        <rect x="555" y="65" width="290" height="95" rx="6" fill="#f0fdf4" stroke="#22c55e" stroke-width="1.5" filter="url(#shadow)"/>
        <text x="565" y="86" font-size="12" font-weight="bold" fill="#15803d">Dual Sandboxed Execution Engine</text>
        <rect x="565" y="96" width="135" height="52" rx="4" fill="#ffffff" stroke="#86efac" />
        <text x="572" y="114" font-size="10" font-weight="bold" fill="#166534">Primary: Piston</text>
        <text x="572" y="128" font-size="9" fill="#475569">Docker Linux Container</text>
        <text x="572" y="140" font-size="9" fill="#475569">Port 2000 REST API</text>

        <rect x="705" y="96" width="130" height="52" rx="4" fill="#ffffff" stroke="#86efac" />
        <text x="712" y="114" font-size="10" font-weight="bold" fill="#166534">Fallback: GCC 13</text>
        <text x="712" y="128" font-size="9" fill="#475569">Local /tmp Sandboxing</text>
        <text x="712" y="140" font-size="9" fill="#475569">2000ms Timeout Reaper</text>

        <!-- AI Engine -->
        <rect x="555" y="172" width="290" height="90" rx="6" fill="#faf5ff" stroke="#a855f7" stroke-width="1.5" filter="url(#shadow)"/>
        <text x="565" y="193" font-size="12" font-weight="bold" fill="#7e22ce">Google Gemini AI Subsystems</text>
        <text x="565" y="210" font-size="10" fill="#475569">• Practice Explainer: Failover (2.0-flash-lite → 1.5-flash → 1.5-pro)</text>
        <text x="565" y="226" font-size="10" fill="#475569">• Exam Conceptual Gatekeeper: Multi-Rubric (50% threshold)</text>
        <text x="565" y="242" font-size="10" fill="#475569">• Ingestion AI: Automated classification & test case generation</text>

        <!-- Database -->
        <rect x="555" y="275" width="290" height="120" rx="6" fill="#f8fafc" stroke="#64748b" stroke-width="1.5" filter="url(#shadow)"/>
        <text x="565" y="296" font-size="12" font-weight="bold" fill="#0f172a">MongoDB Atlas Persistence Layer</text>
        <text x="565" y="316" font-size="10" fill="#475569">• User, Problem, Submission, Progress, Topic</text>
        <text x="565" y="334" font-size="10" fill="#475569">• Exam, ExamQuestion, ExamAllocation, ExamAnswerSubmission</text>
        <text x="565" y="352" font-size="10" fill="#475569">• ExamCodeSubmission, ExamAuditLog, StudentExamProgress</text>
        <text x="565" y="370" font-size="10" fill="#475569">• QuestionExtractionJob (Bulk Review Queue)</text>

        <!-- Connecting Arrows -->
        <line x1="240" y1="180" x2="280" y2="180" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrow-blue)"/>
        <line x1="240" y1="270" x2="280" y2="270" stroke="#475569" stroke-width="2" marker-end="url(#arrow)"/>
        <line x1="500" y1="110" x2="540" y2="110" stroke="#16a34a" stroke-width="2" marker-end="url(#arrow-green)"/>
        <line x1="500" y1="215" x2="540" y2="215" stroke="#a855f7" stroke-width="2" marker-end="url(#arrow)"/>
        <line x1="500" y1="330" x2="540" y2="330" stroke="#64748b" stroke-width="2" marker-end="url(#arrow)"/>
      </svg>
    </div>
    '''

    # SVG 2: AI Subsystems Workflow
    svg_ai = '''
    <div class="diagram-wrapper">
      <div class="diagram-title">Figure 4.1: ClabToPro Multi-Workflow AI Engine Architecture</div>
      <svg viewBox="0 0 880 230" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <defs>
          <marker id="arrow2" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#475569" />
          </marker>
        </defs>

        <!-- Flow 1 -->
        <rect x="20" y="15" width="840" height="60" rx="8" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1.5" />
        <text x="35" y="36" font-size="12" font-weight="bold" fill="#1e40af">1. Practice Learning Assistant</text>
        <text x="35" y="55" font-size="10" fill="#3b82f6">Failed Submission Detected</text>
        <line x1="180" y1="50" x2="220" y2="50" stroke="#475569" stroke-width="1.5" marker-end="url(#arrow2)"/>
        <rect x="225" y="27" width="260" height="35" rx="4" fill="#ffffff" stroke="#93c5fd"/>
        <text x="235" y="44" font-size="10" font-weight="bold" fill="#1e3a8a">Multi-Model Failover Chain</text>
        <text x="235" y="56" font-size="9" fill="#64748b">gemini-2.0-flash-lite → 1.5-flash → 1.5-pro</text>
        <line x1="490" y1="50" x2="530" y2="50" stroke="#475569" stroke-width="1.5" marker-end="url(#arrow2)"/>
        <rect x="535" y="27" width="310" height="35" rx="4" fill="#dbeafe" stroke="#60a5fa"/>
        <text x="545" y="44" font-size="10" font-weight="bold" fill="#1e40af">Pedagogical Debugging Guidance</text>
        <text x="545" y="56" font-size="9" fill="#1e40af">Identifies logic gap without revealing full C code</text>

        <!-- Flow 2 -->
        <rect x="20" y="85" width="840" height="60" rx="8" fill="#fdf4ff" stroke="#f5d0fe" stroke-width="1.5" />
        <text x="35" y="106" font-size="12" font-weight="bold" fill="#86198f">2. Exam Conceptual Gatekeeper</text>
        <text x="35" y="125" font-size="10" fill="#a21caf">Student Submits Logic in Notepad</text>
        <line x1="205" y1="120" x2="235" y2="120" stroke="#475569" stroke-width="1.5" marker-end="url(#arrow2)"/>
        <rect x="240" y="97" width="280" height="35" rx="4" fill="#ffffff" stroke="#f0abfc"/>
        <text x="250" y="113" font-size="10" font-weight="bold" fill="#701a75">4-Dimension Automated Rubric Evaluation</text>
        <text x="250" y="125" font-size="9" fill="#64748b">Logic (40%) • Syntax (30%) • Edge Cases (15%) • Complexity (15%)</text>
        <line x1="525" y1="120" x2="555" y2="120" stroke="#475569" stroke-width="1.5" marker-end="url(#arrow2)"/>
        <rect x="560" y="97" width="285" height="35" rx="4" fill="#fae8ff" stroke="#e879f9"/>
        <text x="570" y="113" font-size="10" font-weight="bold" fill="#86198f">Score &gt;= 50% Threshold Gate</text>
        <text x="570" y="125" font-size="9" fill="#86198f">Unlocks Code Editor / If &lt; 50%, supplies corrective hints</text>

        <!-- Flow 3 -->
        <rect x="20" y="155" width="840" height="60" rx="8" fill="#f0fdf4" stroke="#bbf7d0" stroke-width="1.5" />
        <text x="35" y="176" font-size="12" font-weight="bold" fill="#166534">3. Bulk Exam Question Ingestion</text>
        <text x="35" y="195" font-size="10" fill="#15803d">PDF / Excel Upload (160-200 Qs)</text>
        <line x1="205" y1="190" x2="235" y2="190" stroke="#475569" stroke-width="1.5" marker-end="url(#arrow2)"/>
        <rect x="240" y="167" width="280" height="35" rx="4" fill="#ffffff" stroke="#86efac"/>
        <text x="250" y="183" font-size="10" font-weight="bold" fill="#14532d">Coordinate Parser &amp; Footer Stripper</text>
        <text x="250" y="195" font-size="9" fill="#64748b">BBox boundary detection, removes headers &amp; page numbers</text>
        <line x1="525" y1="190" x2="555" y2="190" stroke="#475569" stroke-width="1.5" marker-end="url(#arrow2)"/>
        <rect x="560" y="167" width="285" height="35" rx="4" fill="#dcfce7" stroke="#4ade80"/>
        <text x="570" y="183" font-size="10" font-weight="bold" fill="#166534">AI Pattern Classifier &amp; Review Queue</text>
        <text x="570" y="195" font-size="9" fill="#166534">Classifies Pattern vs Matrix vs Standard code with confidence score</text>
      </svg>
    </div>
    '''

    # SVG 3: Student Exam 8-State Progression Machine
    svg_states = '''
    <div class="diagram-wrapper">
      <div class="diagram-title">Figure 5.1: Student Examination 8-State Finite State Machine</div>
      <svg viewBox="0 0 880 260" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <defs>
          <marker id="arrow3" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#475569" />
          </marker>
          <marker id="arrow-red" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#dc2626" />
          </marker>
          <marker id="arrow-green2" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#16a34a" />
          </marker>
        </defs>

        <!-- Start node -->
        <circle cx="40" cy="80" r="14" fill="#1e293b" />
        <line x1="55" y1="80" x2="85" y2="80" stroke="#475569" stroke-width="2" marker-end="url(#arrow3)"/>

        <!-- State 1: NOT_STARTED -->
        <rect x="90" y="55" width="115" height="50" rx="6" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1.5" />
        <text x="100" y="77" font-size="11" font-weight="bold" fill="#1e293b">NOT_STARTED</text>
        <text x="100" y="93" font-size="9" fill="#64748b">Enrolled in Exam</text>
        <line x1="205" y1="80" x2="235" y2="80" stroke="#475569" stroke-width="2" marker-end="url(#arrow3)"/>

        <!-- State 2: IN_PROGRESS -->
        <rect x="240" y="55" width="115" height="50" rx="6" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5" />
        <text x="250" y="77" font-size="11" font-weight="bold" fill="#1d4ed8">IN_PROGRESS</text>
        <text x="250" y="93" font-size="9" fill="#2563eb">Instructions Ack'd</text>
        <line x1="355" y1="80" x2="385" y2="80" stroke="#475569" stroke-width="2" marker-end="url(#arrow3)"/>

        <!-- State 3: CONCEPTUAL_PENDING -->
        <rect x="390" y="55" width="145" height="50" rx="6" fill="#fef3c7" stroke="#f59e0b" stroke-width="1.5" />
        <text x="400" y="76" font-size="11" font-weight="bold" fill="#b45309">CONCEPTUAL_PENDING</text>
        <text x="400" y="92" font-size="9" fill="#78350f">AI Rubric Evaluation</text>

        <!-- Down/Up from CONCEPTUAL_PENDING to CONCEPTUAL_FAILED -->
        <line x1="450" y1="105" x2="450" y2="155" stroke="#dc2626" stroke-width="2" marker-end="url(#arrow-red)"/>
        <text x="455" y="135" font-size="9" font-weight="bold" fill="#dc2626">&lt; 50%</text>

        <!-- State 4: CONCEPTUAL_FAILED -->
        <rect x="390" y="160" width="145" height="50" rx="6" fill="#fef2f2" stroke="#ef4444" stroke-width="1.5" />
        <text x="400" y="181" font-size="11" font-weight="bold" fill="#b91c1c">CONCEPTUAL_FAILED</text>
        <text x="400" y="197" font-size="9" fill="#7f1d1d">Re-attempts Notepad</text>
        <!-- Loop back arrow -->
        <path d="M 390 185 Q 360 185 360 80 Q 360 80 385 80" fill="none" stroke="#dc2626" stroke-width="1.5" marker-end="url(#arrow-red)"/>

        <!-- From CONCEPTUAL_PENDING to CODING_IN_PROGRESS -->
        <line x1="535" y1="80" x2="565" y2="80" stroke="#16a34a" stroke-width="2" marker-end="url(#arrow-green2)"/>
        <text x="540" y="73" font-size="9" font-weight="bold" fill="#16a34a">&gt;= 50%</text>

        <!-- State 5: CODING_IN_PROGRESS -->
        <rect x="570" y="55" width="135" height="50" rx="6" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5" />
        <text x="580" y="76" font-size="11" font-weight="bold" fill="#1d4ed8">CODING_IN_PROGRESS</text>
        <text x="580" y="92" font-size="9" fill="#2563eb">Monaco Exam Editor</text>
        <line x1="705" y1="80" x2="730" y2="80" stroke="#475569" stroke-width="2" marker-end="url(#arrow3)"/>

        <!-- State 6: EVALUATING -->
        <rect x="735" y="55" width="115" height="50" rx="6" fill="#f3e8ff" stroke="#a855f7" stroke-width="1.5" />
        <text x="745" y="76" font-size="11" font-weight="bold" fill="#7e22ce">EVALUATING</text>
        <text x="745" y="92" font-size="9" fill="#6b21a8">Test Cases Run</text>

        <!-- Down arrow to COMPLETED -->
        <line x1="790" y1="105" x2="790" y2="155" stroke="#16a34a" stroke-width="2" marker-end="url(#arrow-green2)"/>

        <!-- State 7: COMPLETED -->
        <rect x="735" y="160" width="115" height="50" rx="6" fill="#f0fdf4" stroke="#22c55e" stroke-width="1.5" />
        <text x="745" y="181" font-size="11" font-weight="bold" fill="#15803d">COMPLETED</text>
        <text x="745" y="197" font-size="9" fill="#14532d">Graded &amp; Certified</text>

        <!-- Double circle end node -->
        <circle cx="790" cy="235" r="12" fill="#ffffff" stroke="#15803d" stroke-width="2"/>
        <circle cx="790" cy="235" r="7" fill="#15803d" />
        <line x1="790" y1="210" x2="790" y2="223" stroke="#16a34a" stroke-width="1.5" marker-end="url(#arrow-green2)"/>

        <!-- State 8: TIMED_OUT -->
        <rect x="240" y="160" width="115" height="50" rx="6" fill="#fef2f2" stroke="#ef4444" stroke-width="1.5" />
        <text x="250" y="181" font-size="11" font-weight="bold" fill="#b91c1c">TIMED_OUT</text>
        <text x="250" y="197" font-size="9" fill="#7f1d1d">Timer Expired</text>
        <line x1="295" y1="105" x2="295" y2="155" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4" marker-end="url(#arrow-red)"/>
      </svg>
    </div>
    '''

    # Use plain alphanumeric markers that markdown parser won't format as italic/bold
    md_text = re.sub(r'```mermaid\nflowchart TD[\s\S]*?```', 'MARKERSVGARCH', md_text, count=1)
    md_text = re.sub(r'```mermaid\nflowchart LR[\s\S]*?```', 'MARKERSVGAI', md_text, count=1)
    md_text = re.sub(r'```mermaid\nstateDiagram-v2[\s\S]*?```', 'MARKERSVGSTATES', md_text, count=1)

    # Initialize markdown renderer with table and strikethrough
    md = markdown_it.MarkdownIt('commonmark').enable('table').enable('strikethrough')
    rendered_body = md.render(md_text)

    # Inject raw SVGs into rendered HTML
    rendered_body = re.sub(r'<p>\s*MARKERSVGARCH\s*</p>', svg_arch, rendered_body)
    rendered_body = rendered_body.replace('MARKERSVGARCH', svg_arch)
    rendered_body = re.sub(r'<p>\s*MARKERSVGAI\s*</p>', svg_ai, rendered_body)
    rendered_body = rendered_body.replace('MARKERSVGAI', svg_ai)
    rendered_body = re.sub(r'<p>\s*MARKERSVGSTATES\s*</p>', svg_states, rendered_body)
    rendered_body = rendered_body.replace('MARKERSVGSTATES', svg_states)

    # Insert page breaks before top-level sections (H2)
    rendered_body = re.sub(r'(<h2>[1-9][0-9]?\.)', r'<div class="page-break"></div>\1', rendered_body)

    html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ClabToPro Platform — Master Technical Documentation & System Manual</title>
<style>
  @page {{
    size: A4 portrait;
    margin: 22mm 18mm 22mm 18mm;
    @top-right {{
      content: "ClabToPro Technical Documentation";
      font-size: 8pt;
      color: #64748b;
    }}
    @bottom-center {{
      content: "Page " counter(page);
      font-size: 8pt;
      color: #64748b;
    }}
  }}

  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.55;
    color: #1e293b;
    background-color: #ffffff;
    margin: 0;
    padding: 0;
  }}

  /* Cover Page */
  .cover-page {{
    page-break-after: always;
    padding-top: 60px;
    padding-bottom: 40px;
    text-align: center;
  }}
  .cover-badge {{
    display: inline-block;
    padding: 6px 16px;
    background-color: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1d4ed8;
    border-radius: 9999px;
    font-size: 11pt;
    font-weight: 600;
    margin-bottom: 24px;
    letter-spacing: 0.5px;
  }}
  .cover-title {{
    font-size: 28pt;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.2;
    margin-bottom: 12px;
  }}
  .cover-subtitle {{
    font-size: 14pt;
    color: #475569;
    max-width: 650px;
    margin: 0 auto 36px auto;
    line-height: 1.4;
  }}
  .cover-rule {{
    width: 120px;
    height: 4px;
    background: #2563eb;
    margin: 20px auto 40px auto;
    border-radius: 2px;
  }}
  .cover-metadata {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 24px;
    max-width: 550px;
    margin: 0 auto;
    text-align: left;
    font-size: 10pt;
  }}
  .metadata-row {{
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid #f1f5f9;
  }}
  .metadata-row:last-child {{
    border-bottom: none;
  }}
  .metadata-label {{
    color: #64748b;
    font-weight: 600;
  }}
  .metadata-value {{
    color: #0f172a;
    font-weight: 500;
  }}

  /* Typography */
  h1 {{
    font-size: 18pt;
    font-weight: 800;
    color: #0f172a;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 8px;
    margin-top: 24px;
    margin-bottom: 14px;
  }}
  h2 {{
    font-size: 14pt;
    font-weight: 700;
    color: #1e3a8a;
    border-bottom: 1.5px solid #dbeafe;
    padding-bottom: 6px;
    margin-top: 26px;
    margin-bottom: 12px;
  }}
  h3 {{
    font-size: 11.5pt;
    font-weight: 600;
    color: #1e293b;
    margin-top: 18px;
    margin-bottom: 8px;
  }}
  h4 {{
    font-size: 10.5pt;
    font-weight: 600;
    color: #334155;
    margin-top: 14px;
    margin-bottom: 6px;
  }}
  p {{
    margin-top: 0;
    margin-bottom: 10px;
  }}
  ul, ol {{
    margin-top: 0;
    margin-bottom: 12px;
    padding-left: 24px;
  }}
  li {{
    margin-bottom: 4px;
  }}

  /* Code Blocks */
  pre {{
    background-color: #0f172a;
    color: #f8fafc;
    padding: 12px 14px;
    border-radius: 6px;
    font-family: "DejaVu Sans Mono", "Consolas", "Courier New", monospace;
    font-size: 8.5pt;
    line-height: 1.45;
    overflow-x: auto;
    border: 1px solid #334155;
    margin: 10px 0 14px 0;
    white-space: pre-wrap;
    word-break: break-all;
  }}
  code {{
    font-family: "DejaVu Sans Mono", "Consolas", "Courier New", monospace;
    font-size: 8.5pt;
    background-color: #f1f5f9;
    color: #be185d;
    padding: 1.5px 4px;
    border-radius: 4px;
  }}
  pre code {{
    background-color: transparent;
    color: inherit;
    padding: 0;
  }}

  /* Tables */
  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0 16px 0;
    font-size: 8.5pt;
  }}
  th, td {{
    border: 1px solid #cbd5e1;
    padding: 6px 10px;
    text-align: left;
    vertical-align: top;
  }}
  th {{
    background-color: #f1f5f9;
    font-weight: 700;
    color: #0f172a;
  }}
  tr:nth-child(even) td {{
    background-color: #f8fafc;
  }}

  /* Blockquotes / Callouts */
  blockquote {{
    border-left: 4px solid #3b82f6;
    background-color: #eff6ff;
    padding: 8px 14px;
    margin: 12px 0;
    border-radius: 0 6px 6px 0;
    color: #1e3a8a;
  }}
  blockquote p {{
    margin: 0;
  }}

  /* Diagrams */
  .diagram-wrapper {{
    background-color: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px;
    margin: 18px 0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }}
  .diagram-title {{
    font-size: 9pt;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 10px;
    text-align: center;
  }}

  .page-break {{
    page-break-before: always;
  }}
</style>
</head>
<body>

<div class="cover-page">
  <div class="cover-badge">ACADEMIC &amp; ENGINEERING MANUAL</div>
  <div class="cover-title">CLABTOPro Platform</div>
  <div class="cover-subtitle">Enterprise Online Judging, Pedagogy-First AI Tutoring, and High-Integrity Academic Examination System for C Programming Laboratories</div>
  <div class="cover-rule"></div>

  <div class="cover-metadata">
    <div class="metadata-row">
      <span class="metadata-label">System Version</span>
      <span class="metadata-value">v2.4.0 (Production Architecture)</span>
    </div>
    <div class="metadata-row">
      <span class="metadata-label">Concurrent Capacity</span>
      <span class="metadata-value">120+ Active Lab Students</span>
    </div>
    <div class="metadata-row">
      <span class="metadata-label">Execution Sandboxes</span>
      <span class="metadata-value">Isolated Piston Docker + Sandboxed GCC 13 Runner</span>
    </div>
    <div class="metadata-row">
      <span class="metadata-label">AI Intelligence</span>
      <span class="metadata-value">Google Gemini (Failover Chain &amp; Rubric Gate)</span>
    </div>
    <div class="metadata-row">
      <span class="metadata-label">Client Framework</span>
      <span class="metadata-value">React 18 • Vite 8 • Tailwind CSS • Monaco Editor</span>
    </div>
    <div class="metadata-row">
      <span class="metadata-label">Backend Runtime</span>
      <span class="metadata-value">Node.js 22 • Express • MongoDB Atlas</span>
    </div>
    <div class="metadata-row">
      <span class="metadata-label">Author</span>
      <span class="metadata-value">Department of Computer Science &amp; Engineering</span>
    </div>
    <div class="metadata-row">
      <span class="metadata-label">Publication Date</span>
      <span class="metadata-value">November 2026</span>
    </div>
  </div>
</div>

{rendered_body}

</body>
</html>
'''

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    print("HTML documentation generated at", html_path)

    # Convert to PDF via LibreOffice
    cmd = [
        "libreoffice",
        "-env:UserInstallation=file:///tmp/lo_profile",
        "--headless",
        "--convert-to",
        "pdf:writer_pdf_Export",
        "--outdir",
        pdf_out_dir,
        html_path
    ]
    
    print("Converting HTML to PDF via LibreOffice...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    print("Return code:", result.returncode)
    print("Stdout:", result.stdout)
    if result.stderr:
        print("Stderr:", result.stderr)

    generated_pdf = os.path.join(pdf_out_dir, "CLABTOPro_Documentation.pdf")
    if os.path.exists(generated_pdf):
        print(f"PDF successfully generated at: {generated_pdf}")
        # Run pdfinfo to inspect page count
        info = subprocess.run(["pdfinfo", generated_pdf], capture_output=True, text=True)
        print(info.stdout)
    else:
        print("PDF conversion failed!")

if __name__ == "__main__":
    generate_pdf()
