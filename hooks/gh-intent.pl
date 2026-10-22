#!/usr/bin/perl
# Read one shell command on stdin. Print the tags that apply, one per line:
#   CREATE       it opens a PR (gh pr create|new, gh api POST .../pulls, graphql createPullRequest)
#   MERGE        it merges a PR (gh pr merge, gh api .../pulls/N/merge, graphql merge mutations)
#   TARGET       the PR names another branch or repo (--head, -H, -R, --repo, GH_REPO=)
#   CD           it changes repo inside the command (cd, pushd, git -C, --git-dir, GIT_DIR=)
#   GITMUT       it also makes or moves commits (git commit/merge/rebase/reset/..., npm version, gh pr checkout)
# Strict on purpose: no shell parsing. Quotes and backslashes are removed and
# whitespace (newlines too) collapsed, then the words match anywhere, so a quoted, split or
# merely mentioned "gh pr create" counts too. Put long text (PR body) in a file.
use strict; use warnings;
my $s = do { local $/; <STDIN> } // '';
$s =~ tr/'"\\//d;         # "gh" pr 'merge' -> gh pr merge
$s =~ s/\s+/ /g;          # one line

my $gh   = qr{(?:^|[^\w.-])(?:[\w./-]*/)?gh(?:\s+-{1,2}\S+(?:\s+[^\s-]\S*)?)*}i;   # macOS: GH runs gh
my $pr   = qr{\s+pr(?:\s+-{1,2}\S+(?:\s+[^\s-]\S*)?)*}i;
my $api  = qr{$gh\s+api\b(?![^;&|]*(?:-X\s*GET|--method[=\s]*GET)\b)}i;               # GET only reads
my %tag;
$tag{CREATE} = 1 if $s =~ /$gh$pr\s+(?:create|new)\b/i
  || ($s =~ /$api[^;&|]*\bpulls\/?(?:\s|$)/ && $s =~ /$api[^;&|]*(?:-X\s*POST|--method[=\s]*POST|\s-[fF]|\s--(?:raw-)?field\b|\s--input\b)/i)
  || $s =~ /$api[^;&|]*\bgraphql\b.*\bcreatePullRequest\b/;
$tag{MERGE} = 1 if $s =~ /$gh$pr\s+merge\b/i
  || $s =~ /$api[^;&|]*\bpulls\/\S*?\/merge\b/
  || $s =~ /$api[^;&|]*\bgraphql\b.*\b(?:mergePullRequest|enablePullRequestAutoMerge)\b/;
$tag{TARGET} = 1 if $tag{CREATE} && $s =~ /(?:\s(?:--head|-H|-R|--repo)(?:[=\s]|$)|\bGH_REPO=)/;
$tag{CD}     = 1 if $s =~ /(?:^|[;&|(\s])(?:cd|pushd)\s|\bgit\s+-C\b|--git-dir\b|\bGIT_(?:DIR|WORK_TREE)=/;
$tag{GITMUT} = 1 if $s =~ /\bgit(?:\s+(?:-[Cc]\s+\S+|-\S+))*\s+(?:commit|merge|rebase|reset|cherry-pick|pull|am|revert|checkout|switch|stash|restore)\b/
  || $s =~ /\b(?:npm|pnpm|yarn)\s+version\b|$gh$pr\s+checkout\b/;

print "$_\n" for sort keys %tag;
