# -*- coding: utf-8 -*-

import os
import errno
import sys
import argparse
import requests
import codecs
import re
import csv

from botapad import parse_url

# dumps resource form a foldr
# * googledoc as .txt
# * hackmd as .md
# * ethercalc as .csv
# extra resource


def mkdir_p(path, verbose=False):
    try:
        if verbose: print "* creating directory %s " % path
        os.makedirs(path)
    except OSError as exc:  # Python >2.5
        if exc.errno == errno.EEXIST and os.path.isdir(path):
            pass
        else:
            raise

def main():
    """ """
    parser = argparse.ArgumentParser()
    
    parser.add_argument("command" , action='store', help="command", default=None)
    parser.add_argument("foldr" , action='store', help="foldr url", default=None)
    parser.add_argument("path" , action='store', help="path  txt file to parse ", default=None)
    parser.add_argument("-v" ,"--verbose" , action='store_true', help="verbose", default=None)

    args = parser.parse_args()

    foldr = "foldr"
    
    re_pad = "https?://foldr.padagraph.io/(.*)(?:/edit)?"
    m = re.findall(re_pad, args.foldr)
    if len(foldr):
        foldr = m[0]
        url = "https://ethercalc.org/%s.csv" % foldr
    else :
        url = foldr

    if args.command == "dump":
        dump(url, foldr, args.path, verbose=args.verbose)


def dump(url, foldr, path, verbose=False):
    
    if verbose: print "## dumping foldr %s == %s ..." %( url, foldr )
    # create dump dir_
    mkdir_p(path, verbose)

    # get foldr configuration calc

    outfile = "%s/foldr-%s.csv" % ( path, foldr )
    content = requests.get(url).text
    with codecs.open(outfile , 'wb', encoding="utf8") as f:
        f.write(content)
        
    if verbose: print content

    # parse content
    urls = []
    current_dir = path
    lines = content.split("\n")
    for line in lines[2:] :
        cells = [ re.sub("[\"']", '', e ) for e in line.split(',')]
        if not len([ e for e in line.split(',') if len(e)]): continue
        # subdir
        if cells[0] == "<:" :
            current_dir = path
        if cells[0] == "" and len(cells[1]):
            current_dir = "%s/%s" % (path , cells[1])
            mkdir_p(current_dir)
            
        if 'http://' in cells[0] or 'https://' in cells[0]:
            if 'botapad.padagraph.io' in cells[0] : continue
            #title = "".join(re.findall("[a-zA-Z0-9]", title ))
            urls.append( [current_dir , cells[1]] + list( parse_url(cells[0] ) ))

    # store files
    for i, e in enumerate(urls):
        dir, name, url, gid, ftype = e
        outfile = "%s/%s-%s%s%s" % ( dir, i, name.replace('/', ''), "." if len(ftype) else "", ftype )
        print " * Downloading %s to %s" % ( url, outfile)

        response = requests.get(url)
        if response.status_code == 200:
            with open(outfile , 'wb') as f:
                f.write(response.content)
        
    
if __name__ == '__main__':
    sys.exit(main())
    