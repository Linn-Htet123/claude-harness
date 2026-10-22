#!/usr/bin/perl
# Read one shell command on stdin. Print the tags that apply, one per line:
#   CREATE       it opens a PR (gh pr create|new, gh api POST .../pulls, graphql createPullRequest)
#   MERGE        it merges a PR (gh pr merge, gh api .../pulls/N/merge, graphql merge mutations)
#   TARGET       the PR names another branch or repo (--head, -H, -R, --repo, GH_REPO=)
#   CD           it changes repo inside the command (cd, pushd, git -C, --git-dir, GIT_DIR=)
#   GITMUT       it also makes or moves commits (git commit/merge/rebase/reset/..., npm version, gh pr checkout)
#   PUSHMAIN     a git push names main/master (also refs/heads/main, :main, --all, --mirror)
#   FORCE        a git push forces (--force*, -f in short flags, +refspec, --mirror)
#   PUSHCUR <p>  a git push goes to the current branch (no refspec, HEAD, @, $(...)); <p> = its -C path,
#                - (none) or ? (unreadable)
#   SWITCH       it changes branch (git checkout / switch) before a push can run
# Strict on purpose: no shell parsing. Quotes and backslashes are removed and
# whitespace (newlines too) collapsed, then the words match anywhere, so a quoted, split or
# merely mentioned "gh pr create" counts too. Put long text (PR body) in a file.
use strict; use warnings;
my $raw = do { local $/; <STDIN> } // '';
my $s = $raw;
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

# git push: walk each command (lines and ; & | ( ) { } ! split it), token by token
$tag{SWITCH} = 1 if $s =~ /\bgit(?:\s+(?:-[Cc]\s+\S+|-\S+))*\s+(?:checkout|switch)\b/;
my $p = $raw;
$p =~ s/\\\n//g;                                     # join backslash-newline
$p =~ tr/'"\\//d;
$p =~ s/\d*[<>]+&?\s*\S*//g;                         # drop redirects: 2>&1, >/dev/null, <in
my @cur;
for my $seg (split /[;&|(){}!\n]/, $p) {
  my @t = split ' ', $seg;
  shift @t while @t && $t[0] !~ m{(?:^|/)git$}i;     # git anywhere: timeout, xargs, then, do, ...
  next unless @t;
  shift @t; my ($path, $matching) = ('-', 0);
  while (@t && $t[0] =~ /^-/) {                      # git's own flags, some take a value
    my $f = shift @t;
    next unless $f =~ /^(?:-[Cc]|--(?:git-dir|work-tree|namespace|exec-path|config-env|attr-source|super-prefix))$/;
    my $v = shift @t // '';
    $path = $v if $f eq '-C';
    $matching = 1 if $f eq '-c' && $v =~ /^push\.default=matching$/i;
  }
  next unless @t;
  if (lc($t[0]) ne 'push') {                         # a -C path with a space splits into words
    next unless $path ne '-' && grep { lc($_) eq 'push' } @t[1 .. ($#t < 3 ? $#t : 3)];
    $path = '?'; shift @t while @t && lc($t[0]) ne 'push';
  }
  shift @t;
  my (@pos, $tags, $delete, $dry, $all);
  while (@t) {
    my $a = shift @t;
    if ($a =~ /^(?:-o|--push-option|--repo|--receive-pack|--exec)$/) { shift @t; next }
    $tag{FORCE} = 1 if $a =~ /^--force(?:-with-lease|-if-includes)?(?:=|$)|^--mirror$/ || $a =~ /^-[a-zA-Z]*f[a-zA-Z]*$/;
    $tags = 1   if $a eq '--tags';
    $delete = 1 if $a =~ /^(?:--delete|-d)$/;
    $dry = 1    if $a =~ /^(?:--dry-run|-n)$/;
    $all = 1    if $a =~ /^(?:--all|--branches|--mirror)$/;
    push @pos, $a unless $a =~ /^-/;
  }
  shift @pos;                                        # the remote
  $tag{PUSHMAIN} = 1 if $all || ($matching && !@pos);
  for my $r (@pos) {
    $tag{FORCE} = 1 if $r =~ /^\+/;
    $tag{PUSHMAIN} = 1 if $r =~ m{(?:^|:)(?:refs/)?(?:heads/)?(?:main|master)$} || $r =~ /\*/ || $r eq ':';
    push @cur, $path if !$delete && $r =~ /^(?:HEAD|@)(?:[~^]\d*)*$|^\$|^`/;
  }
  push @cur, $path if !@pos && !$tags && !$delete && !$dry && !$all;
}
print "$_\n" for sort keys %tag;
print "PUSHCUR $_\n" for @cur;
