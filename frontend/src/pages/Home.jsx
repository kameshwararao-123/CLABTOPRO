// src/Pages/Home.jsx

import React from "react";
import { Link } from "react-router-dom";
import {
  Code2,
  CalendarDays,
  CheckCircle2,
  BarChart3,
  Flame,
  ArrowRight,
  Terminal,
  BookOpen,
} from "lucide-react";

const Home = () => {
  return (
    <div className="min-h-screen bg-[#f7f9ff] text-slate-900">

      {/* =====================================================
          NAVBAR
      ====================================================== */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-6">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600">
              <Code2 size={25} className="text-white" />
            </div>

            <div>
              <h1 className="text-xl font-bold tracking-tight">
                CLAB
              </h1>

              <p className="text-[10px] text-slate-500">
                C Learning & Assessment Buddy
              </p>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden items-center gap-8 md:flex">

            <a
              href="#features"
              className="text-sm font-medium text-slate-600 transition hover:text-blue-600"
            >
              Features
            </a>

            <a
              href="#how-it-works"
              className="text-sm font-medium text-slate-600 transition hover:text-blue-600"
            >
              How it works
            </a>

            <a
              href="#about"
              className="text-sm font-medium text-slate-600 transition hover:text-blue-600"
            >
              About
            </a>

          </nav>

          {/* Auth buttons */}
          <div className="flex items-center gap-3">

            <Link
              to="/login"
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Login
            </Link>

            <Link
              to="/register"
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Sign Up
            </Link>

          </div>
        </div>
      </header>


      {/* =====================================================
          HERO
      ====================================================== */}
      <main>

        <section>
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-6 py-20 lg:grid-cols-2 lg:py-24">

            {/* LEFT */}
            <div>

              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-600" />

                <span className="text-xs font-semibold text-blue-700">
                  C Programming Practice Platform
                </span>
              </div>


              <h1 className="max-w-xl text-5xl font-bold leading-[1.1] tracking-tight text-slate-900 md:text-6xl">
                Practice C.
                <br />
                <span className="text-blue-600">
                  Build Your Logic.
                </span>
              </h1>


              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
                CLAB is a simple practice platform for students learning
                C programming. Solve problems, submit your code, and
                improve your programming skills one day at a time.
              </p>


              <div className="mt-8 flex flex-wrap gap-3">

                <Link
                  to="/register"
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Start Practicing
                  <ArrowRight size={17} />
                </Link>


                <Link
                  to="/login"
                  className="rounded-lg border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600"
                >
                  I already have an account
                </Link>

              </div>


              {/* Small points */}
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3">

                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2
                    size={17}
                    className="text-green-500"
                  />
                  Daily practice
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2
                    size={17}
                    className="text-green-500"
                  />
                  C problems
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2
                    size={17}
                    className="text-green-500"
                  />
                  Progress tracking
                </div>

              </div>

            </div>


            {/* RIGHT - PRODUCT PREVIEW */}
            <div className="relative">

              {/* Main browser */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">

                {/* Browser header */}
                <div className="flex h-12 items-center gap-2 border-b border-slate-200 bg-slate-50 px-4">

                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-400" />

                  <div className="ml-4 flex-1 rounded-md bg-white px-3 py-1.5 text-xs text-slate-400">
                    clab.app/problem/today
                  </div>

                </div>


                {/* App */}
                <div className="grid min-h-[420px] grid-cols-[170px_1fr]">

                  {/* Sidebar */}
                  <div className="hidden border-r border-slate-100 bg-[#fbfcff] p-4 sm:block">

                    <div className="mb-8 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                        <Code2
                          size={17}
                          className="text-white"
                        />
                      </div>

                      <span className="font-bold">
                        CLAB
                      </span>
                    </div>


                    <div className="space-y-2">

                      <div className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">
                        Dashboard
                      </div>

                      <div className="px-3 py-2 text-xs text-slate-500">
                        Today's Problem
                      </div>

                      <div className="px-3 py-2 text-xs text-slate-500">
                        All Problems
                      </div>

                      <div className="px-3 py-2 text-xs text-slate-500">
                        My Submissions
                      </div>

                      <div className="px-3 py-2 text-xs text-slate-500">
                        Statistics
                      </div>

                    </div>

                  </div>


                  {/* Dashboard */}
                  <div className="bg-[#f7f9ff] p-5">

                    <div className="flex items-center justify-between">

                      <div>
                        <p className="text-[10px] font-medium text-slate-400">
                          TODAY'S PROBLEM
                        </p>

                        <h3 className="mt-1 text-lg font-bold">
                          Largest of Three Numbers
                        </h3>
                      </div>

                      <span className="rounded-full bg-green-100 px-3 py-1 text-[10px] font-semibold text-green-700">
                        Easy
                      </span>

                    </div>


                    {/* Problem */}
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">

                      <p className="text-xs leading-5 text-slate-500">
                        Write a C program to find the largest among
                        three given numbers.
                      </p>

                      <div className="mt-4 flex gap-2 text-[10px]">

                        <span className="rounded-md bg-slate-100 px-2 py-1">
                          Conditions
                        </span>

                        <span className="rounded-md bg-slate-100 px-2 py-1">
                          C Basics
                        </span>

                      </div>

                    </div>


                    {/* Code editor */}
                    <div className="mt-4 overflow-hidden rounded-xl bg-[#172333]">

                      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">

                        <span className="text-[10px] font-medium text-slate-300">
                          main.c
                        </span>

                        <button className="rounded-md bg-blue-600 px-3 py-1.5 text-[10px] font-semibold text-white">
                          Run Code
                        </button>

                      </div>


                      <div className="p-4 font-mono text-[11px] leading-6">

                        <div>
                          <span className="mr-4 text-slate-600">
                            1
                          </span>

                          <span className="text-blue-400">
                            #include
                          </span>{" "}

                          <span className="text-orange-300">
                            &lt;stdio.h&gt;
                          </span>
                        </div>

                        <div>
                          <span className="mr-4 text-slate-600">
                            2
                          </span>
                        </div>

                        <div>
                          <span className="mr-4 text-slate-600">
                            3
                          </span>

                          <span className="text-blue-400">
                            int
                          </span>{" "}

                          <span className="text-yellow-300">
                            main
                          </span>

                          <span className="text-white">
                            () {"{"}
                          </span>
                        </div>

                        <div>
                          <span className="mr-4 text-slate-600">
                            4
                          </span>

                          <span className="text-blue-400">
                            int
                          </span>{" "}

                          <span className="text-white">
                            a, b, c;
                          </span>
                        </div>

                        <div>
                          <span className="mr-4 text-slate-600">
                            5
                          </span>

                          <span className="text-blue-400">
                            scanf
                          </span>

                          <span className="text-white">
                            ("%d %d %d", &a, &b, &c);
                          </span>
                        </div>

                        <div>
                          <span className="mr-4 text-slate-600">
                            6
                          </span>

                          <span className="text-blue-400">
                            return
                          </span>{" "}

                          <span className="text-orange-300">
                            0
                          </span>

                          <span className="text-white">
                            ;
                          </span>
                        </div>

                        <div>
                          <span className="mr-4 text-slate-600">
                            7
                          </span>

                          <span className="text-white">
                            {"}"}
                          </span>
                        </div>

                      </div>

                    </div>

                  </div>

                </div>
              </div>


              {/* Floating streak */}
              <div className="absolute -bottom-6 -left-5 hidden rounded-xl border border-orange-100 bg-white p-4 shadow-lg sm:block">

                <div className="flex items-center gap-3">

                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50">
                    <Flame
                      size={21}
                      className="text-orange-500"
                    />
                  </div>

                  <div>
                    <p className="text-[10px] text-slate-400">
                      Current streak
                    </p>

                    <p className="font-bold">
                      7 days
                    </p>
                  </div>

                </div>

              </div>


              {/* Floating solved */}
              <div className="absolute -right-4 top-10 hidden rounded-xl border border-green-100 bg-white p-4 shadow-lg sm:block">

                <p className="text-[10px] text-slate-400">
                  Problems solved
                </p>

                <p className="mt-1 text-xl font-bold text-green-600">
                  32
                </p>

              </div>

            </div>

          </div>
        </section>


        {/* =====================================================
            WHAT CLAB DOES
        ====================================================== */}
        <section className="border-y border-slate-200 bg-white">

          <div className="mx-auto grid max-w-7xl md:grid-cols-3">

            <div className="border-b border-slate-200 p-8 md:border-b-0 md:border-r">

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
                <CalendarDays
                  size={21}
                  className="text-blue-600"
                />
              </div>

              <h3 className="mt-5 font-bold">
                One problem every day
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Practice a focused problem instead of getting lost
                among hundreds of unrelated questions.
              </p>

            </div>


            <div className="border-b border-slate-200 p-8 md:border-b-0 md:border-r">

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-50">
                <Terminal
                  size={21}
                  className="text-green-600"
                />
              </div>

              <h3 className="mt-5 font-bold">
                Write and submit C code
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Write your solution directly in the browser and
                submit it for evaluation.
              </p>

            </div>


            <div className="p-8">

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50">
                <BarChart3
                  size={21}
                  className="text-purple-600"
                />
              </div>

              <h3 className="mt-5 font-bold">
                Understand your progress
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                See your solved problems, submissions, streak and
                topic-wise progress.
              </p>

            </div>

          </div>

        </section>


        {/* =====================================================
            FEATURES
        ====================================================== */}
        <section
          id="features"
          className="mx-auto max-w-7xl px-6 py-24"
        >

          <div className="max-w-2xl">

            <p className="text-sm font-bold uppercase tracking-wider text-blue-600">
              Why CLAB
            </p>

            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
              Learn programming by actually programming.
            </h2>

            <p className="mt-4 leading-7 text-slate-500">
              CLAB is designed around a simple idea: students improve
              when they regularly solve problems, not just when they
              read programming concepts.
            </p>

          </div>


          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">

            {/* Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6">

              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50">
                <BookOpen
                  size={21}
                  className="text-blue-600"
                />
              </div>

              <h3 className="mt-5 font-bold">
                Topic-based problems
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Problems can be organised around topics such as
                input/output, conditions, loops, arrays and functions.
              </p>

            </div>


            {/* Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6">

              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-orange-50">
                <Flame
                  size={21}
                  className="text-orange-500"
                />
              </div>

              <h3 className="mt-5 font-bold">
                Coding streak
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                A simple streak system encourages students to make
                programming practice a regular habit.
              </p>

            </div>


            {/* Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6">

              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50">
                <CheckCircle2
                  size={21}
                  className="text-green-600"
                />
              </div>

              <h3 className="mt-5 font-bold">
                Submission feedback
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Students can see whether their submitted solution
                passes the required test cases.
              </p>

            </div>


            {/* Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6">

              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-purple-50">
                <BarChart3
                  size={21}
                  className="text-purple-600"
                />
              </div>

              <h3 className="mt-5 font-bold">
                Progress tracking
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Students can understand how much they have practiced
                and which topics still need attention.
              </p>

            </div>


            {/* Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6">

              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-yellow-50">
                <Code2
                  size={21}
                  className="text-yellow-600"
                />
              </div>

              <h3 className="mt-5 font-bold">
                Beginner focused
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Problems start with basic programming concepts and
                gradually become more challenging.
              </p>

            </div>


            {/* Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6">

              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-50">
                <Terminal
                  size={21}
                  className="text-indigo-600"
                />
              </div>

              <h3 className="mt-5 font-bold">
                Practice without setup
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Students can practice from the browser without
                installing a C compiler on their device.
              </p>

            </div>

          </div>

        </section>


        {/* =====================================================
            HOW IT WORKS
        ====================================================== */}
        <section
          id="how-it-works"
          className="border-y border-slate-200 bg-white"
        >

          <div className="mx-auto max-w-7xl px-6 py-24">

            <div className="text-center">

              <p className="text-sm font-bold uppercase tracking-wider text-blue-600">
                How it works
              </p>

              <h2 className="mt-3 text-3xl font-bold">
                A simple daily routine
              </h2>

            </div>


            <div className="mt-14 grid gap-8 md:grid-cols-4">

              {/* Step 1 */}
              <div className="text-center">

                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
                  01
                </div>

                <h3 className="mt-5 font-bold">
                  Learn
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Learn the concept taught in your class.
                </p>

              </div>


              {/* Step 2 */}
              <div className="text-center">

                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
                  02
                </div>

                <h3 className="mt-5 font-bold">
                  Practice
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Open your daily problem and understand the requirement.
                </p>

              </div>


              {/* Step 3 */}
              <div className="text-center">

                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
                  03
                </div>

                <h3 className="mt-5 font-bold">
                  Submit
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Write your C program and submit your solution.
                </p>

              </div>


              {/* Step 4 */}
              <div className="text-center">

                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
                  04
                </div>

                <h3 className="mt-5 font-bold">
                  Improve
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Check your progress and come back tomorrow.
                </p>

              </div>

            </div>

          </div>

        </section>


        {/* =====================================================
            ABOUT / CTA
        ====================================================== */}
        <section id="about">

          <div className="mx-auto max-w-5xl px-6 py-24">

            <div className="rounded-3xl bg-blue-600 px-8 py-14 text-center md:px-16">

              <Code2
                size={38}
                className="mx-auto text-white"
              />

              <h2 className="mt-6 text-3xl font-bold text-white md:text-4xl">
                Start with one problem.
              </h2>

              <p className="mx-auto mt-4 max-w-xl leading-7 text-blue-100">
                You don't need to solve hundreds of problems today.
                Start with one, understand it, and keep coming back.
              </p>

              <Link
                to="/register"
                className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3.5 text-sm font-bold text-blue-600 transition hover:bg-blue-50"
              >
                Create an account
                <ArrowRight size={17} />
              </Link>

            </div>

          </div>

        </section>

      </main>


      {/* =====================================================
          FOOTER
      ====================================================== */}
      <footer className="border-t border-slate-200 bg-white">

        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-6 py-8 md:flex-row">

          <div className="flex items-center gap-3">

            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
              <Code2
                size={19}
                className="text-white"
              />
            </div>

            <div>
              <p className="font-bold">
                CLAB
              </p>

              <p className="text-[10px] text-slate-500">
                C Learning & Assessment Buddy
              </p>
            </div>

          </div>


          <div className="flex gap-6 text-sm text-slate-500">

            <a
              href="#features"
              className="hover:text-blue-600"
            >
              Features
            </a>

            <a
              href="#how-it-works"
              className="hover:text-blue-600"
            >
              How it works
            </a>

            <Link
              to="/login"
              className="hover:text-blue-600"
            >
              Login
            </Link>

          </div>


          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} CLAB
          </p>

        </div>

      </footer>

    </div>
  );
};

export default Home;