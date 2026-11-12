import type { Choice, QuestionType, Toolkit } from "@/lib/types";

export type QuestionDraft = {
  id: string;
  type: QuestionType;
  prompt: string;
  choices: Choice[];
  correctChoiceId: string;
  explanation: string;
};

export type BiteDraft = {
  id: string;
  title: string;
  body: string;
  sourceNote: string;
  lastReviewedOn: string;
  diagram?: string | null;
  crossLinks?: { targetCode: string; label: string }[];
  questions: QuestionDraft[];
};

export type SubLessonDraft = { id: string; title: string; bites: BiteDraft[] };

export type LessonDraft = {
  id: string;
  code: string;
  title: string;
  prerequisiteIds?: string[];
  subLessons: SubLessonDraft[];
};

export type SubCategoryDraft = {
  id: string;
  code: string;
  title: string;
  levelTag: string;
  toolkit: Toolkit;
  lessons: LessonDraft[];
};

export type CourseDraft = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  author: string;
  licence: string;
  aiGenerated: boolean;
  categories: {
    id: string;
    code: string;
    title: string;
    summary: string;
    subCategories: SubCategoryDraft[];
  }[];
};

const reviewed = "2026-11-12";

function mc(
  id: string,
  prompt: string,
  choices: [string, string, string, string],
  correctIndex: 0 | 1 | 2 | 3,
  explanation: string,
): QuestionDraft {
  const ids = ["a", "b", "c", "d"] as const;
  return {
    id,
    type: "multiple_choice",
    prompt,
    choices: choices.map((text, index) => ({ id: ids[index], text })),
    correctChoiceId: ids[correctIndex],
    explanation,
  };
}

function bite(
  id: string,
  title: string,
  body: string,
  sourceNote: string,
  questions: [QuestionDraft, QuestionDraft],
  extra?: { diagram?: string; crossLinks?: { targetCode: string; label: string }[] },
): BiteDraft {
  return {
    id,
    title,
    body,
    sourceNote,
    lastReviewedOn: reviewed,
    diagram: extra?.diagram ?? null,
    crossLinks: extra?.crossLinks ?? [],
    questions,
  };
}

const conditionalDiagram = `flowchart TD
  A["Look at the condition"] --> B{"Is it true?"}
  B -->|Yes| C["Run the if branch"]
  B -->|No| D["Run the else branch"]
  C --> E["Continue"]
  D --> E`;

const httpDiagram = `sequenceDiagram
  participant App
  participant API
  App->>API: Send an HTTP request
  API-->>App: Send a status code and a body`;

export const courseDraft: CourseDraft = {
  id: "crs_applied_ai",
  title: "Applied AI Engineering",
  subtitle: "From first Python concepts to applied AI work",
  description:
    "A self-paced course: shared foundations, then a main track in LLM and agentic engineering, with electives later. Bite Sized does not assume a subject. This package is only module A1, the first module of the first course.",
  author: "Eric D'Souza",
  licence: "Private family licence. Prepared for Eric D'Souza, November 2026. Not for redistribution.",
  aiGenerated: false,
  categories: [
    {
      id: "cat_track_a",
      code: "A",
      title: "Track A: Foundations",
      summary: "Required groundwork. Python here is concepts for reading and directing AI-written code, not a syntax drill.",
      subCategories: [
        {
          id: "sub_a1",
          code: "A1",
          title: "Python Concepts for AI-Assisted Development",
          levelTag: "Foundations",
          toolkit: {
            handsOnProjects: [
              "Use an AI assistant to build a small API-calling script, then explain and debug every line.",
              "Code-review exercise: find the bugs in AI-generated code.",
            ],
            toolsAndFrameworks: ["Python 3", "Cursor / VS Code", "GitHub Copilot", "Jupyter", "Google Colab", "Git", "uv"],
            learningOutcomes: [
              "Read, understand, and debug Python written by AI.",
              "Direct AI coding assistants with clear specs.",
            ],
          },
          lessons: [
            {
              id: "les_a1_1",
              code: "A1.1",
              title: "Core Programming Concepts",
              subLessons: [
                {
                  id: "sll_a1_1_1",
                  title: "Data Types & Structures",
                  bites: [
                    bite(
                      "bit_a1_types",
                      "Strings, numbers, and booleans",
                      "Python values have types. Text in quotes is a string, like \"hello\". Whole numbers and decimals are numbers, like 2 and 2.5. A boolean is only True or False, with those capitals. The quoted word \"True\" is text, not a boolean. When you read AI-written code, name the type of each value before you trust how it is used.",
                      "Python language reference, built-in types · confidence: high",
                      [
                        mc(
                          "q_a1_types_1",
                          "Which of these is a boolean?",
                          ["\"True\"", "True", "true", "1"],
                          1,
                          "True and False, with capitals and no quotes, are booleans. \"True\" is a string. 1 is a number, even though Python treats True as equal to 1.",
                        ),
                        mc(
                          "q_a1_types_2",
                          "What type is 2.5?",
                          ["A string", "A boolean", "A number", "A list"],
                          2,
                          "2.5 is a float, one of Python's number types. A string would be in quotes.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_collections",
                      "Lists, dictionaries, sets, and tuples",
                      "A list keeps items in order, and you can change it: [\"red\", \"blue\"]. A tuple is also ordered, but it is fixed, like (\"red\", \"blue\"). A dictionary maps a key to a value and keeps keys in the order you added them: {\"name\": \"Eric\"}. A set holds unique items and does not promise an order. Duplicates in a set disappear.",
                      "Python tutorial, data structures · confidence: high",
                      [
                        mc(
                          "q_a1_collections_1",
                          "You need a name-to-score mapping you can look up by name. What fits?",
                          ["A set", "A dictionary", "A single boolean", "A number"],
                          1,
                          "A dictionary stores a value under a key, so a name can point at a score.",
                        ),
                        mc(
                          "q_a1_collections_2",
                          "What happens when you add the same item to a set twice?",
                          ["It is stored twice, in order", "The set keeps one copy", "Python turns it into a list", "It becomes a tuple"],
                          1,
                          "A set drops duplicates. It also does not give you an order you can rely on.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_mutability",
                      "Mutability",
                      "Some values can be changed in place. Lists, dictionaries, and sets can. Strings and tuples cannot: any \"change\" builds a new value. If two names point at the same list, editing it through one name shows up on the other. That surprise is common in generated code. A second name is not a copy. Use .copy() when you need a separate list.",
                      "Python data model, mutable vs immutable objects · confidence: high",
                      [
                        mc(
                          "q_a1_mutability_1",
                          "Two variables name the same list. You append an item through the first. What does the second see?",
                          ["The original list only", "The list with the new item", "A string of the item", "An error, always"],
                          1,
                          "Both names refer to one list object. Appending changes that object, so both names see it.",
                        ),
                        mc(
                          "q_a1_mutability_2",
                          "Which value cannot be changed in place?",
                          ["A list", "A dictionary", "A string", "A set"],
                          2,
                          "Strings are immutable. Methods like replace return a new string rather than editing the old one.",
                        ),
                      ],
                    ),
                  ],
                },
                {
                  id: "sll_a1_1_2",
                  title: "Control Flow",
                  bites: [
                    bite(
                      "bit_a1_conditionals",
                      "Conditionals",
                      "if, elif, and else choose a path. Python uses indentation, not braces, to show which lines belong to a branch. The first true condition runs, and the rest are skipped. A missing indent is a syntax error. When you read generated code, check that each branch is indented under the right condition and that a later elif is not impossible.",
                      "Python tutorial, if statements · confidence: high",
                      [
                        mc(
                          "q_a1_conditionals_1",
                          "score is 80. The code checks if score > 90, then elif score > 70. Which branch runs?",
                          ["The if branch", "The elif branch", "Both branches", "Neither branch"],
                          1,
                          "80 is not greater than 90, so the if is skipped. 80 is greater than 70, so the elif runs.",
                        ),
                        mc(
                          "q_a1_conditionals_2",
                          "How does Python know which lines belong to an if branch?",
                          ["By braces around them", "By indentation under the if", "By a semicolon at the end", "By the word branch"],
                          1,
                          "A consistent indent marks the block. The next line that is outdented is outside the branch.",
                        ),
                      ],
                      { diagram: conditionalDiagram },
                    ),
                    bite(
                      "bit_a1_loops",
                      "Loops and iteration",
                      "A for loop walks a collection one item at a time: for name in names. range(3) yields 0, then 1, then 2 — it stops before 3. A while loop repeats as long as its condition stays true. If that condition never becomes false, the loop never ends. Generated loops are worth tracing with a tiny collection before you trust them.",
                      "Python tutorial, for and while · confidence: high",
                      [
                        mc(
                          "q_a1_loops_1",
                          "How many times does for n in range(3) run the body?",
                          ["2", "3", "4", "Until you stop it"],
                          1,
                          "range(3) produces 0, 1, and 2. That is three passes, and 3 itself is not included.",
                        ),
                        mc(
                          "q_a1_loops_2",
                          "When does a while loop stop?",
                          ["After exactly one pass", "When its condition is false", "When the file ends", "Only if you use for instead"],
                          1,
                          "Before each pass, Python checks the condition. A false condition ends the loop.",
                        ),
                      ],
                    ),
                  ],
                },
                {
                  id: "sll_a1_1_3",
                  title: "Functions",
                  bites: [
                    bite(
                      "bit_a1_scope",
                      "Inputs, outputs, and scope",
                      "A function takes inputs (parameters), does one job, and can return an output. A name created inside the function stays there unless you return it or it was already outside. If there is no return, the function gives back None. Callers that forget to use the return value are a frequent bug in AI-written code. Read the def line and the return before the middle.",
                      "Python tutorial, defining functions · confidence: high",
                      [
                        mc(
                          "q_a1_scope_1",
                          "A function creates a variable and does not return it. What can the caller see?",
                          ["The variable, automatically", "None, unless something else is returned", "The whole function source", "Every local name as a list"],
                          1,
                          "Local names stay inside the function. With no return, the result of the call is None.",
                        ),
                        mc(
                          "q_a1_scope_2",
                          "What is the usual way for a function to hand a result back?",
                          ["Print it and hope", "Use return", "Write it into a tuple named output", "Indent the caller"],
                          1,
                          "return sends a value to the caller. print only displays text; it does not hand the value back.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_single",
                      "Reusable, single-purpose functions",
                      "A good function does one job, and its name says what that job is. total_of(numbers) is easier to trust than process(data). Small functions are easier to test and easier to ask an AI to change without breaking the rest. If a generated function loads a file, calls the network, and formats a report, split the idea in your head even before you split the code.",
                      "Common Python style, single responsibility · confidence: high",
                      [
                        mc(
                          "q_a1_single_1",
                          "Which function name best matches a single job?",
                          ["do_stuff", "handle", "average_of", "run"],
                          2,
                          "average_of says the one job. The others could hide almost anything.",
                        ),
                        mc(
                          "q_a1_single_2",
                          "Why prefer a small, single-purpose function when an assistant writes code?",
                          ["Short functions are always faster", "You can test and change one job without rereading everything", "Python only allows ten lines", "It avoids the need to return anything"],
                          1,
                          "A narrow function is easier to check, name, and rewrite. Speed is a separate question.",
                        ),
                      ],
                    ),
                  ],
                },
              ],
            },
            {
              id: "les_a1_2",
              code: "A1.2",
              title: "Organizing Code",
              prerequisiteIds: ["les_a1_1"],
              subLessons: [
                {
                  id: "sll_a1_2_1",
                  title: "Classes & Objects",
                  bites: [
                    bite(
                      "bit_a1_classes",
                      "Classes, objects, and methods",
                      "A class is a blueprint. An object is one built thing, also called an instance. A method is a function that belongs to the object, and its first parameter is usually self, the instance itself. __init__ runs when the object is created and is where you store starting data on self. Read self.something as \"this object's something.\"",
                      "Python tutorial, classes · confidence: high",
                      [
                        mc(
                          "q_a1_classes_1",
                          "You have a class named Learner. What is one Learner(...) call creating?",
                          ["A second class", "An instance of Learner", "A module", "A package"],
                          1,
                          "Calling the class builds an instance. The class is the blueprint; the instance is the object.",
                        ),
                        mc(
                          "q_a1_classes_2",
                          "In a method, what does self usually refer to?",
                          ["The whole program", "The instance the method was called on", "The class name as text", "The return value of __init__"],
                          1,
                          "self is the object before the dot in learner.rename(). __init__ uses it to store that object's starting data.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_models",
                      "Data models",
                      "A dataclass is a class meant to hold data. You declare the fields, and Python writes the boring __init__ for you. Pydantic is a library with a similar idea, plus checks: if a field should be a number and you pass text, it tells you. That is useful for settings and for data from an API. A dataclass does not, by itself, validate types at runtime.",
                      "Python dataclasses docs and Pydantic models overview · confidence: high",
                      [
                        mc(
                          "q_a1_models_1",
                          "What does a dataclass mainly save you from writing?",
                          ["The HTTP server", "A repetitive __init__ for the fields", "The tests", "The virtual environment"],
                          1,
                          "A dataclass generates __init__ and a few helpers from the fields you list.",
                        ),
                        mc(
                          "q_a1_models_2",
                          "Why do people reach for Pydantic on API data?",
                          ["It replaces Python lists", "It checks that incoming data matches the shape you declared", "It makes code run without a network", "It is part of the Python standard library"],
                          1,
                          "Pydantic validates and parses data into a model. It is a third-party library, not a built-in.",
                        ),
                      ],
                    ),
                  ],
                },
                {
                  id: "sll_a1_2_2",
                  title: "Modules & Packages",
                  bites: [
                    bite(
                      "bit_a1_imports",
                      "Imports and project structure",
                      "A module is a Python file you can import. import math brings in the math module. from pathlib import Path brings in one name. A package is a folder of modules you import as a group. Keep related files together so imports read like a path: from notes import parse. Circular imports, where two files import each other at the top, are a common generated-code tangle.",
                      "Python tutorial, modules · confidence: high",
                      [
                        mc(
                          "q_a1_imports_1",
                          "What is a module?",
                          ["A running virtual environment", "A Python file you can import", "A boolean flag", "Only a folder with tests"],
                          1,
                          "A module is a file of Python code. Importing it lets another file use its names.",
                        ),
                        mc(
                          "q_a1_imports_2",
                          "What does from pathlib import Path do?",
                          ["Runs Path immediately", "Makes the name Path available from that module", "Creates a folder named Path", "Installs pathlib from the internet"],
                          1,
                          "pathlib is in the standard library. This import binds the name Path in your file.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_docs",
                      "Reading library documentation",
                      "When an assistant picks a library, read the docs for the version you have installed. Start with a short example, then the parameter list: what is required, what is optional, and what the function returns. Check the exceptions it raises. A blog post can be stale. The project's own docs, matched to your version, are the contract you are actually calling.",
                      "Practice for reading library docs · confidence: high",
                      [
                        mc(
                          "q_a1_docs_1",
                          "An assistant imports a library you do not know. What should you check first?",
                          ["A random older blog", "The docs for the version you installed", "Only the function name", "Whether the file is indented"],
                          1,
                          "Behavior changes between versions. Match the docs to the version in your environment.",
                        ),
                        mc(
                          "q_a1_docs_2",
                          "Which question is most useful while reading a function's docs?",
                          ["What does it return, and what can it raise?", "Is the logo blue?", "How many GitHub stars does it have?", "Does the name sound modern?"],
                          0,
                          "The return value and the errors tell you how to use the function and what can go wrong.",
                        ),
                      ],
                    ),
                  ],
                },
                {
                  id: "sll_a1_2_3",
                  title: "Environments & Dependencies",
                  bites: [
                    bite(
                      "bit_a1_venv",
                      "Virtual environments",
                      "A virtual environment gives a project its own set of installed libraries. python -m venv .venv creates one with the standard library. uv venv does the same job with the uv tool, which is also fast at installing packages. Activate the environment before you install or run, so you are not changing the Python that belongs to the whole computer. Two projects can then use two versions of the same library.",
                      "Python venv docs and the uv documentation · confidence: high",
                      [
                        mc(
                          "q_a1_venv_1",
                          "Why give a project a virtual environment?",
                          ["So its libraries stay separate from other projects", "So Python runs without electricity", "So you never need Git", "So booleans become optional"],
                          0,
                          "Each environment has its own installed packages. Projects stop stepping on each other's versions.",
                        ),
                        mc(
                          "q_a1_venv_2",
                          "Which command uses only the Python standard library to create an environment?",
                          ["uv add", "python -m venv .venv", "git commit", "pip freeze"],
                          1,
                          "venv is included with Python. uv is a separate, faster tool that can also create environments.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_deps",
                      "Dependency files",
                      "requirements.txt is a list of packages, often with versions pinned, like requests==2.32.3. pyproject.toml is the modern project file and can list dependencies too. A pin makes next month's install match today's. An unpinned name installs whatever is newest, which may break the code. Commit the dependency file. Do not commit the virtual environment folder itself.",
                      "Python packaging user guide · confidence: high",
                      [
                        mc(
                          "q_a1_deps_1",
                          "What does requests==2.32.3 in a requirements file mean?",
                          ["Install any requests", "Install that exact version", "Uninstall requests", "Import requests inside a string"],
                          1,
                          "The == pin asks the installer for that version, so the environment is repeatable.",
                        ),
                        mc(
                          "q_a1_deps_2",
                          "What should you commit to Git?",
                          ["The .venv folder", "The dependency file, not the environment folder", "Your API keys", "Every __pycache__ folder"],
                          1,
                          "The dependency file lets someone rebuild the environment. The environment folder is local and large.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_git",
                      "Version control with Git and GitHub",
                      "Git stores snapshots of your project, called commits. A branch is a line of commits you can use to try a change without losing the main line. GitHub is a website that hosts Git repositories. It is not Git itself. Before you ask an assistant for a big edit, commit or at least look at git status, so you can see the diff and return to a known snapshot.",
                      "Git basics and GitHub docs · confidence: high",
                      [
                        mc(
                          "q_a1_git_1",
                          "What is a commit?",
                          ["A hosted website", "A snapshot of the project", "A virtual environment", "A Python package"],
                          1,
                          "A commit records the project at one moment so you can compare and return to it.",
                        ),
                        mc(
                          "q_a1_git_2",
                          "How are Git and GitHub related?",
                          ["They are the same program", "Git is the version-control tool; GitHub hosts Git repositories", "GitHub replaces the need to commit", "Git only works on GitHub"],
                          1,
                          "You can use Git locally with no GitHub. GitHub is one place to store and share a repository.",
                        ),
                      ],
                    ),
                  ],
                },
              ],
            },
            {
              id: "les_a1_3",
              code: "A1.3",
              title: "Talking to the Outside World",
              prerequisiteIds: ["les_a1_1"],
              subLessons: [
                {
                  id: "sll_a1_3_1",
                  title: "Async Concepts",
                  bites: [
                    bite(
                      "bit_a1_sync",
                      "Synchronous vs asynchronous code",
                      "Synchronous code waits. The next line runs only when this one has finished. Asynchronous code can start a wait, such as a network call, and do other waiting work until the result is ready. async def defines a coroutine. await pauses that coroutine until the awaited job finishes. Async does not make a heavy calculation faster. It helps when the program is waiting.",
                      "Python asyncio docs, coroutines · confidence: high",
                      [
                        mc(
                          "q_a1_sync_1",
                          "What is async especially useful for?",
                          ["Waiting on slow I/O, like network calls", "Making every loop faster", "Replacing the need for functions", "Turning strings into numbers"],
                          0,
                          "Async overlaps waits. A CPU-bound calculation still needs the CPU the whole time.",
                        ),
                        mc(
                          "q_a1_sync_2",
                          "What does await do inside an async function?",
                          ["Skips the next line forever", "Pauses until the awaited job has a result", "Creates a virtual environment", "Prints the stack trace"],
                          1,
                          "await gives control back to the event loop until that job completes, then continues with the result.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_concurrent",
                      "Concurrent API calls",
                      "If three network calls do not depend on each other, you can start them together. asyncio.gather(one(), two(), three()) waits for all of them. Three one-second calls can then finish in about one second, not three. You still await the gather. Do this only when the calls are independent. If the second call needs the first call's result, they have to stay in order.",
                      "Python asyncio docs, gather · confidence: high",
                      [
                        mc(
                          "q_a1_concurrent_1",
                          "Three independent one-second API calls run with asyncio.gather. About how long might they take?",
                          ["About one second", "About three seconds, always", "About nine seconds", "They cannot finish"],
                          0,
                          "Gather overlaps the waits. The wall-clock time is close to the slowest call, not the sum.",
                        ),
                        mc(
                          "q_a1_concurrent_2",
                          "When should you not run two calls concurrently?",
                          ["When both are network calls", "When the second needs the first result", "When they use await", "When they return JSON"],
                          1,
                          "If one result is an input to the next, the second has to wait. Order matters there.",
                        ),
                      ],
                    ),
                  ],
                },
                {
                  id: "sll_a1_3_2",
                  title: "APIs, HTTP & JSON",
                  bites: [
                    bite(
                      "bit_a1_api",
                      "What an API is",
                      "An API is a contract for asking another program to do something or return data. On the web, that contract is usually a URL you call with HTTP, plus rules for the request and the response. The docs are the contract. A library is not the API itself; it is one way to call it. Read which URL, which method, and which fields are required before you trust generated client code.",
                      "HTTP APIs, conceptual · confidence: high",
                      [
                        mc(
                          "q_a1_api_1",
                          "On the web, what is an API most often?",
                          ["A private folder on your laptop", "A contract for calling another program, often over HTTP", "A Python boolean", "A Git branch"],
                          1,
                          "The API is the agreed way to ask. HTTP is the usual transport for web APIs.",
                        ),
                        mc(
                          "q_a1_api_2",
                          "What should you treat as the contract for an API?",
                          ["The colour of the website", "Its documentation for the endpoints you call", "The length of the file", "The assistant's confidence"],
                          1,
                          "The docs say which URLs, methods, and fields are valid. Generated code can drift from that.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_http",
                      "HTTP requests and responses",
                      "A request has a method, a URL, headers, and sometimes a body. GET usually reads. POST usually sends data to create something or to trigger work. The response has a status code and often a body. 200 means success, 400 means your request was bad, 401 means you are not authenticated, 404 means it is missing, 429 means you are going too fast, and 500 means the server failed.",
                      "HTTP semantics, common status codes · confidence: high",
                      [
                        mc(
                          "q_a1_http_1",
                          "Which method usually reads data without changing it?",
                          ["POST", "GET", "500", "JSON"],
                          1,
                          "GET is the usual read. POST is the usual way to send a body that creates or triggers something.",
                        ),
                        mc(
                          "q_a1_http_2",
                          "What does status 404 mean?",
                          ["Success", "The thing you asked for was not found", "You sent too many requests", "The JSON used single quotes"],
                          1,
                          "404 Not Found means that URL does not point at a resource. 429 is the \"slow down\" code.",
                        ),
                      ],
                      { diagram: httpDiagram },
                    ),
                    bite(
                      "bit_a1_json",
                      "JSON data and API keys",
                      "JSON is text that looks like data: objects in {}, lists in [], strings in double quotes, plus numbers, true, false, and null. Note the lowercase true. Python uses True. An API key is a secret that proves the caller may use the API. Keep it in an environment variable, not in the source you commit or paste into a chat. A quoted key in a screenshot is still a leaked key.",
                      "JSON specification and common API-key practice · confidence: high",
                      [
                        mc(
                          "q_a1_json_1",
                          "Which token is valid JSON for a boolean true?",
                          ["True", "true", "TRUE", "\"true\""],
                          1,
                          "JSON uses lowercase true, false, and null. True is Python, not JSON. \"true\" is a string.",
                        ),
                        mc(
                          "q_a1_json_2",
                          "Where should an API key live?",
                          ["In the source file you commit", "In an environment variable, outside the committed code", "In the function name", "Inside a list called keys in Git"],
                          1,
                          "Environment variables keep the secret out of the repository and out of chat logs.",
                        ),
                      ],
                      { crossLinks: [{ targetCode: "A1.1", label: "see A1.1" }] },
                    ),
                  ],
                },
                {
                  id: "sll_a1_3_3",
                  title: "Error Handling",
                  bites: [
                    bite(
                      "bit_a1_exceptions",
                      "Exceptions and error messages",
                      "When Python cannot continue, it raises an exception. A try block watches for that. An except block handles a chosen type. The message tells you what went wrong; the type tells you which failures you meant to catch. A bare except: hides bugs, including typos. Catch the narrowest type that you know how to handle, and let the rest surface.",
                      "Python tutorial, errors and exceptions · confidence: high",
                      [
                        mc(
                          "q_a1_exceptions_1",
                          "Why is a bare except: a red flag?",
                          ["It only catches network errors", "It hides every error, including ones you did not expect", "It is required by JSON", "It retries the call"],
                          1,
                          "A bare except swallows all exceptions, so real bugs disappear. Catch a specific type instead.",
                        ),
                        mc(
                          "q_a1_exceptions_2",
                          "What should you read first on a failure?",
                          ["The exception type and message", "The licence file", "The virtual environment size", "Only the last print that succeeded"],
                          0,
                          "The type and the message say what failed. The traceback then shows where.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_retries",
                      "Retries and timeouts",
                      "A timeout stops a call that might wait forever. A retry tries again after a failure, usually with a pause that grows — backoff — so you do not hammer a sick server. Retrying a read is usually safe. Retrying a payment or a \"create\" can do the action twice if the first one actually succeeded. That idea is called idempotency: doing it twice should not matter, or you should not blindly retry.",
                      "Conceptual notes on timeouts, backoff, and idempotency · confidence: high",
                      [
                        mc(
                          "q_a1_retries_1",
                          "What is a timeout for?",
                          ["To make a successful call run twice", "To stop waiting after a set time", "To hide the status code", "To pin a dependency"],
                          1,
                          "A timeout bounds the wait. Without one, a stuck call can stall the program.",
                        ),
                        mc(
                          "q_a1_retries_2",
                          "Why be careful retrying a request that creates something?",
                          ["Creates are always free", "The first try may have succeeded, so a retry can create a second one", "JSON forbids retries", "GET is the create method"],
                          1,
                          "If the response was lost but the server did the work, a blind retry repeats a side effect.",
                        ),
                      ],
                      {
                        crossLinks: [
                          { targetCode: "A1.3", label: "see A1.3" },
                          { targetCode: "B5.3", label: "see B5.3" },
                        ],
                      },
                    ),
                  ],
                },
              ],
            },
            {
              id: "les_a1_4",
              code: "A1.4",
              title: "Working with AI-Generated Code",
              prerequisiteIds: ["les_a1_1", "les_a1_2"],
              subLessons: [
                {
                  id: "sll_a1_4_1",
                  title: "Reading & Understanding Code",
                  bites: [
                    bite(
                      "bit_a1_topdown",
                      "Reading code top-down",
                      "Start at the entry point: the function that runs first, or the block under if __name__ == \"__main__\". Note what it calls, then open those functions. For each one, read the name, the parameters, and the return before the details in the middle. You are building a map, not memorising every line. Generated files are easier once you know which function is in charge.",
                      "Reading practice for generated Python · confidence: high",
                      [
                        mc(
                          "q_a1_topdown_1",
                          "Where is a sensible place to start reading a small script?",
                          ["The middle of the longest function", "The entry point that runs first", "The licence comment only", "A random import"],
                          1,
                          "The entry point shows the real sequence. Everything else is there because something called it.",
                        ),
                        mc(
                          "q_a1_topdown_2",
                          "What should you notice about a function before its internal lines?",
                          ["Its name, inputs, and return", "How many blank lines it has", "The author's favourite editor", "Whether the file is on GitHub"],
                          0,
                          "Name, parameters, and return tell you the job. The body is how that job is done.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_trace",
                      "Tracing inputs and outputs",
                      "Pick a tiny input and walk the code by hand. Write down the value of the important names after each line. Include an empty input, such as an empty list or an empty string, because generated code often assumes there is at least one item. If you cannot say what comes out, you do not understand it yet. That is the moment to slow down, not to run it on real data.",
                      "Manual tracing as a reading technique · confidence: high",
                      [
                        mc(
                          "q_a1_trace_1",
                          "Why trace an empty list as well as a normal one?",
                          ["Empty lists are faster", "Generated code often assumes the collection has an item", "Empty lists cannot be arguments", "Python forbids empty collections"],
                          1,
                          "Indexing the first item of an empty list raises an error. A trace catches that assumption.",
                        ),
                        mc(
                          "q_a1_trace_2",
                          "What are you writing down as you trace?",
                          ["The colour scheme", "How key values change for one input", "Every comment, verbatim", "The Git history"],
                          1,
                          "A trace is a record of values. It shows what the code actually does with that input.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_redflags",
                      "Spotting red flags in generated code",
                      "Slow down when you see a bare except, a secret written into the file, a function that does five jobs, or a comment that claims something the code does not do. Also watch for unused results, checks that can never be true, and network calls with no timeout. Confidence in the chat is not evidence. The red flag is an invitation to read that part twice, not a reason to throw the whole file away.",
                      "Review habits for AI-generated Python · confidence: high",
                      [
                        mc(
                          "q_a1_redflags_1",
                          "Which of these is a red flag in generated code?",
                          ["A function with a clear name", "An API key written in the source", "A return of a computed value", "A type you can name"],
                          1,
                          "Secrets do not belong in source. A bare except, a huge function, or a missing timeout are other flags.",
                        ),
                        mc(
                          "q_a1_redflags_2",
                          "A comment says the function retries, but you see no retry. What is going on?",
                          ["Comments are always exact", "The comment and the code disagree, so check the code", "Python ignores the function", "The key is stored safely"],
                          1,
                          "Trust the code over a comment, especially a comment an assistant wrote to sound finished.",
                        ),
                      ],
                    ),
                  ],
                },
                {
                  id: "sll_a1_4_2",
                  title: "Debugging",
                  bites: [
                    bite(
                      "bit_a1_stack",
                      "Reading stack traces",
                      "A Python traceback lists the oldest call first and the newest last. The last line is the exception type and message. The frame just above it is where it was raised. Start there if that frame is your code. If it is inside a library, move up to the last frame that belongs to you: that is the call you made. Read the message before you change anything.",
                      "Python traceback reference · confidence: high",
                      [
                        mc(
                          "q_a1_stack_1",
                          "In a Python traceback, where is the line that raised the exception?",
                          ["The first frame, always", "The last frame, just above the final error line", "Inside the README", "It is not shown"],
                          1,
                          "The newest call is at the bottom. The final line names the exception.",
                        ),
                        mc(
                          "q_a1_stack_2",
                          "The last frame is inside a library. Where do you look next?",
                          ["Only at the library's logo", "Up the trace, to the last frame in your code", "At a random earlier print", "You rewrite the library"],
                          1,
                          "Your frame shows the call you made. That is usually the first place you can change.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_print",
                      "Print, logs, and breakpoints",
                      "print shows a value at one moment. It is fine for a quick look, then take it out. logging is print you can leave in, with levels such as debug, info, warning, and error, so you can quiet it later. A breakpoint pauses the program so you can inspect names. You can set one in the editor or call breakpoint(). Pausing beats guessing when the value is not what you assumed.",
                      "Python logging howto and the breakpoint builtin · confidence: high",
                      [
                        mc(
                          "q_a1_print_1",
                          "What is logging good for, compared with a temporary print?",
                          ["It can stay in the code and be filtered by level", "It hides exceptions", "It replaces tests", "It pins dependencies"],
                          0,
                          "Levels let you keep useful messages and turn down the noisy ones without deleting them.",
                        ),
                        mc(
                          "q_a1_print_2",
                          "What does a breakpoint give you?",
                          ["A paused program you can inspect", "A new Git commit", "A JSON schema", "An automatic retry"],
                          0,
                          "While paused, you can look at the real values instead of guessing which line was wrong.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_pytest",
                      "Testing concepts",
                      "A test is a small check that a piece of behavior stays true. With pytest, a function named test_something calls your code and uses assert to state a fact. If the fact is false, the test fails and shows the values. Tests let you change generated code without re-tracing everything by hand. Start with one example you already understand, including an edge such as an empty input.",
                      "pytest docs, the basics · confidence: high",
                      [
                        mc(
                          "q_a1_pytest_1",
                          "What does a failing assert in a pytest test mean?",
                          ["The fact you stated was not true", "The file failed to save", "Git rejected the branch", "The API key was correct"],
                          0,
                          "assert checks a fact. A failure is evidence about the code, and pytest shows what the values were.",
                        ),
                        mc(
                          "q_a1_pytest_2",
                          "Which name will pytest collect as a test?",
                          ["check_total", "test_total_of_empty_list", "total_of", "Test"],
                          1,
                          "pytest collects functions whose names start with test_, by default.",
                        ),
                      ],
                      { crossLinks: [{ targetCode: "A1.1", label: "see A1.1" }] },
                    ),
                  ],
                },
                {
                  id: "sll_a1_4_3",
                  title: "AI Coding Assistants",
                  bites: [
                    bite(
                      "bit_a1_tools",
                      "Cursor, Copilot, and chat assistants",
                      "Cursor, GitHub Copilot, and chat assistants suggest code from your prompt and the surrounding files. They are fast and they can be wrong with a straight face. You are still the author of anything you run. Use them to draft and to explain, then read the diff. Do not give them secrets. A suggestion that you cannot explain is not ready to keep.",
                      "Product behavior of coding assistants, as a practice note · confidence: high",
                      [
                        mc(
                          "q_a1_tools_1",
                          "Who is responsible for code an assistant suggested and you ran?",
                          ["The assistant, legally and practically, in this course's terms", "You, because you chose to keep and run it", "GitHub, always", "Nobody, if it was autocompleted"],
                          1,
                          "The assistant drafts. You decide what stays, what runs, and what you can explain.",
                        ),
                        mc(
                          "q_a1_tools_2",
                          "What should you do with a suggestion you cannot explain?",
                          ["Keep it if the chat sounded sure", "Read it until you can explain it, or do not keep it", "Commit it so you can forget", "Paste a secret in so it can test itself"],
                          1,
                          "Unexplained code is a bug you have not met yet. Confidence in the reply is not a test.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_specs",
                      "Writing clear coding prompts and specs",
                      "A useful prompt names the goal, the inputs, the outputs, and the constraints. Say what not to change. \"Make it better\" is not a spec. A short written spec — a few sentences you could hand to a person — beats a long vague chat. Include an example: given this input, I want that output. The assistant is filling in a contract, and you wrote the contract.",
                      "Spec-writing practice for coding assistants · confidence: high",
                      [
                        mc(
                          "q_a1_specs_1",
                          "Which prompt is a spec?",
                          ["Make this nicer", "Return the average of a list of numbers. Empty list returns None. Do not change the file reader.", "Fix it", "Use AI"],
                          1,
                          "It names the output, an edge case, and what must stay. The others do not.",
                        ),
                        mc(
                          "q_a1_specs_2",
                          "Why include an example input and output?",
                          ["Examples give a concrete check for the behavior you want", "Examples replace the need to run anything", "JSON requires an example", "It pins the dependency version"],
                          0,
                          "An example is a tiny test in words. You can later turn it into an assert.",
                        ),
                      ],
                    ),
                    bite(
                      "bit_a1_review",
                      "Reviewing and verifying AI output",
                      "After a suggestion: read the diff, run it, and try one edge case. Check that errors are handled on purpose and that no secret was added. If the change is larger than you can review, ask for a smaller one. Verification is the point of this whole module. The assistant can draft the API script. You should still be able to explain every line you keep, and to find the bug in a review exercise.",
                      "Review checklist for this module's learning outcomes · confidence: high",
                      [
                        mc(
                          "q_a1_review_1",
                          "A change is too big to review. What is a sound next step?",
                          ["Merge it quickly", "Ask for a smaller change you can actually read", "Turn off the tests", "Add the API key to the file so it runs"],
                          1,
                          "Review only works on a diff you can hold in your head. Shrink the change.",
                        ),
                        mc(
                          "q_a1_review_2",
                          "Which set matches this module's outcomes?",
                          ["Memorise syntax tables", "Read, debug, and direct assistants with a clear spec", "Avoid running any code", "Let the chat approve its own output"],
                          1,
                          "The aim is to read and debug AI-written Python, and to steer the assistant with a spec you could defend.",
                        ),
                      ],
                    ),
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
