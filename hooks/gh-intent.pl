#!/usr/bin/perl
# Read one shell command on stdin. Print the tags that apply, one per line:
#   CREATE     it opens a PR (gh pr create|new, gh api POST .../pulls, graphql createPullRequest)
#   MERGE      it merges a PR (gh pr merge, gh api .../pulls/N/merge, graphql mergePullRequest)
#   HELP       the CREATE is only a --help / -h call
#   CD         it changes repo inside the command (cd, git -C, --git-dir, GIT_DIR=, GIT_WORK_TREE=)
#   GITMUT     it also makes or moves commits (commit, merge, rebase, reset, cherry-pick, pull, ...)
#   MARKWRITE  it writes into a review-gate/ mark folder by hand
# MERGE is checked on the raw text (fail closed, also catches mentions). CREATE is
# checked on the text a shell would run: quoted strings and heredoc bodies are
# dropped, unless they can run code ($(...) or backticks), or the command is
# handed to another shell (bash -c, sh -c, eval), then the raw text counts too.
use strict; use warnings;
my $raw = do { local $/; <STDIN> } // '';

sub strip {
  my ($s) = @_; my ($out, $q, $buf, @hd) = ('', '', '');
  my ($i, $n) = (0, length $s);
  while ($i < $n) {
    my $c = substr($s, $i, 1);
    if ($q eq "'") { if ($c eq "'") { $q = ''; $out .= "''" } $i++; next }
    if ($q eq '"') {
      if ($c eq '\\') { $buf .= substr($s, $i, 2); $i += 2; next }
      if ($c eq '"') { $q = ''; $out .= ($buf =~ /\$\(|`/) ? "\"$buf\"" : '""'; $buf = ''; $i++; next }
      $buf .= $c; $i++; next;
    }
    if ($c eq '\\') { $out .= substr($s, $i, 2); $i += 2; next }
    if ($c eq "'" || $c eq '"') { $q = $c; $buf = ''; $i++; next }
    if (($i == 0 || substr($s, $i - 1, 1) ne '<')
        && substr($s, $i) =~ /^<<(?!<)-?[ \t]*(['"]?)([A-Za-z_]\w*)\1/) {
      push @hd, [$2, $1 eq '']; $out .= "<<$2"; $i += length $&; next;
    }
    if ($c eq "\n" && @hd) {
      $out .= "\n"; $i++;
      for my $h (@hd) {
        my ($d, $expands) = @$h; my $body = '';
        while ($i < $n) {
          my $e = index($s, "\n", $i);
          my $line = $e < 0 ? substr($s, $i) : substr($s, $i, $e - $i);
          $i = $e < 0 ? $n : $e + 1;
          last if $line =~ /^[ \t]*\Q$d\E[ \t]*$/;
          $body .= "$line\n";
        }
        $out .= $body if $expands && $body =~ /\$\(|`/;   # an unquoted heredoc runs $(...)
      }
      @hd = (); next;
    }
    $out .= $c; $i++;
  }
  return $out;
}

my $run = strip($raw);
my @texts = ($run);
push @texts, $raw if $run =~ /(?:^|[^\w-])(?:bash|sh|zsh|dash|ksh|fish)\s+(?:-\w+\s+)*-\w*c\b|(?:^|[^\w-])eval\b/;

my $gh    = qr{(?:^|[^\w./-])(?:[\w./-]*/)?gh(?:\s+(?:-R\s*\S+|--repo[=\s]\S+|--hostname[=\s]\S+))*};
my $pr    = qr{\s+pr(?:\s+(?:-R\s*\S+|--repo[=\s]\S+))*};
my %tag;
for my $t (@texts) {
  if ($t =~ /$gh$pr\s+(?:create|new)\b([^\n;&|]*)/) { $tag{CREATE} = 1; $tag{HELP} = 1 if $1 =~ /(?:^|\s)(?:--help|-h)(?:\s|$)/ }
  $tag{CREATE} = 1 if $t =~ /$gh\s+api\b[^\n;&|]*\bpulls\b(?!\/)/ && $t =~ /$gh\s+api\b[^\n;&|]*(?:-X\s*POST|--method[=\s]POST|\s-[fF]\s|\s--(?:raw-)?field\b|\s--input\b)/i;
  $tag{CREATE} = 1 if $t =~ /$gh\s+api\s+graphql\b[\s\S]*createPullRequest/;
}
delete $tag{HELP} unless $tag{CREATE};
$tag{MERGE} = 1 if $raw =~ /$gh$pr\s+merge\b/ || $raw =~ /$gh\s+api\b[^\n;&|]*pulls\/\S*?\/merge\b/ || $raw =~ /$gh\s+api\s+graphql\b[\s\S]*mergePullRequest/;
$tag{CD} = 1 if $run =~ /(?:^|[;&|(\s])(?:cd|pushd)\s|\bgit\s+-C\b|--git-dir\b|\bGIT_(?:DIR|WORK_TREE)=/;
$tag{GITMUT} = 1 if $run =~ /\bgit(?:\s+-\S+)*\s+(?:commit|merge|rebase|reset|cherry-pick|pull|am|revert|checkout|switch|stash|restore)\b/;
$tag{MARKWRITE} = 1 if $raw =~ /(?:\btouch\b|\btee\b|\bcp\b|\bmv\b|\bln\b|\binstall\b|\bmkdir\b|\bprintf\b|\becho\b|>)[^\n;&|]*review-gate\/(?!scripts\/)/;
print "$_\n" for sort keys %tag;
