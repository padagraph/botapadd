import sys
import argparse
from botapi import Botagraph, BotApiError
from reliure.types import Text 

from collections import namedtuple
import codecs
import requests
import re
import csv

from botapad import *

#. Assumes that the vertice data are separated from the links,
# that the graph is undirected,
# and that the links are ordered with the same 2 types always at the same position within an edgetype
#(e.g. person -- infraction for all the links or infraction -- person for all the links of an edgetype)


class Histograph(object):

    def __init__(self, links_url):
        """ Function doc
        :param : 
        """
        self.vertices = {}
        self.edges = {}
        self.urls = {}
        self.vtype = {}
        self.evtype = {}
        self.histodata = {}
        self.distribdata = {}
        self.parse(links_url)

    def read(self, path, separator='auto'):

        if path[0:4] == 'http':
            try : 
                url = convert_url(path)
                log( " * Downloading %s \n" % url)
                content = requests.get(url).text
                lines = content.split('\n')
            except :
                raise BotapadURLError("Can't download %s" % url, url)
        else:
            log( " * Opening %s \n" % path)
            try : 
                with codecs.open(path, 'r', encoding='utf8' ) as fin:
                    lines = [ line for line in fin]
            except :
                raise BotapadError("Can't read file %s" % path)

        lines = [ line.strip() for line in lines ]
        lines = [ line.encode('utf8') for line in lines if len(line)]
        
        if separator == u'auto':
            line = lines[0].strip()
            if line in ( '!;','!,'):
                separator = line[1:]
            else: separator = ','

        log(" * Reading %s (%s) lines with delimiter '%s'" % (path, len(lines), separator))

        try : 
            reader = csv.reader(lines, delimiter=separator)
            rows = [ r for r in reader]
            rows = [ [ e.strip().decode('utf8')  for e in r ] for r in rows if len(r) and not all([ len(e) == 0 for e in r]) ]
        except :
            raise BotapadCsvError(path, separator, "Error while parsing data %s lines with separator %s" % (len(lines), separator )  )

        return rows
                    
    def store(self,current,rows,path):
        if current[0]==0:
            rows = [x[0].split(' -- ') for x in rows]
            self.edges[current[1]] = [[x[0].strip(),x[1].strip()] for x in rows]
        else:
            self.vertices[current[1]] = dict([[x[0].strip(),x[1].strip()] for x in rows])
            for x in rows:
                self.vtype[x[0].strip()]=current[1]
        self.urls[current[1]]=path



    def parse(self, path):
        """ :param path : txt file path

        handles special lines starting with [# @ _]
        for comments, node type, property names
        
        """
        csv = self.read(path)
        
        rows = []
        current = () # (VERTEX | EDGE, label, names, index_prop)
        
        
        for row in csv:
            cell = row[0]
            # ! comment
            if cell[:1] == "!":
                continue

            # IMPORT external ressource
            if cell[:1] == "&":
                url = cell[1:].strip()
                self.parse(url)
                    
            # @ Nodetypes, _ Edgetypes
            elif cell[:1] in ("@", "_"):
                if len(current)>0:
                    self.store(current,rows,path)
                # processing directiv
                line = ";".join(row)
                cols = re.sub(' ', '', line[1:]) # no space
                # @Politic: %Chamber; #First Name; #Last Name;%Party;%State;%Stance;Statement;
                cols = [e for e in re.split("[:;,]" , "%s" % cols, flags=re.UNICODE) if len(e)]
                label = cols[0] # @Something
                
                # ( name, type indexed, projection )
                props = [ Prop( norm_key(e), Text(multi="+" in e), "@" in e, "#" in e, "+" in e,  "%" in e, "+" in e and "=" in e ) for e in  cols[1:]]
                    
                if cell[:1] == "@": # nodetype def
                    rows = []
                    current = (VERTEX, label, props)
                        
                elif cell[:1] == "_": # edgetype def
                    rows = []
                    current = (EDGE, label, props)
            else: # table data
                if current and current[2]:
                    for i, v in enumerate(row):
                        if i >= len(props): break
                        if props[i].ismulti :
                            row[i] = [  e.strip() for e in re.split("[_,;]", v.strip(), ) ] 
                            
                rows.append(row)

        self.store(current,rows,path)

    def EdgesToVertices(self):
        for x in self.edges:
                self.evtype[x]={}
                for edge in self.edges[x]:
                    pair =[self.vtype[edge[0]],self.vtype[edge[1]]]
                    pair.sort()
                    self.evtype[x][tuple(pair)] =self.evtype[x].get(tuple(pair), 0) + 1

    def show(self):
        print 'Vertices:'
        for x in self.vertices.keys():
            print x,'\t', self.urls[x]
        print '\nEdges:'
        self.EdgesToVertices()
        for x in self.edges.keys():
            print x,'\t', self.urls[x],'\t',self.evtype[x]


    def checkOrder(self,type1,type2,links):
        if self.vtype[self.edges[links][0][0]]==type1 and self.vtype[self.edges[links][0][1]]==type2:
            self.order = [0,1]
        elif self.vtype[self.edges[links][0][1]]==type1 and self.vtype[self.edges[links][0][0]]==type2:
            self.order = [1,0]
        else:
            print 'oups, vertices and edges do not correspond'
            sys.exit()
        

    def histo(self,type1,type2,links):

    	# writes a framapad padagraph format file
    	fname = links+'_histograph.txt'
        s = open(fname,'w')

        # write the imports of  data file and set the separator
        s.write('!;\n\n& '+self.urls[type2]+'\n\n')
       
        # Count the variable distribution
        self.checkOrder(type1,type2,links)
        counts = {}
        for x in self.edges[links]:    
            counts[x[self.order[1]]]= counts.get(x[self.order[1]],0) + 1
        for x in counts:
            counts[x]=[counts[x],round(counts[x]*100/float(len(self.edges[links])),2)]
     

        # Set the scale
        percents = [x[1] for x in counts.values()]
        rangep =  max(percents) - min(percents)
        step = round(rangep/10.0,0)
        print step
        pnode = int(min(percents))
        pnodes = {}
        p = []

        # Create a scale 
        while pnode<max(percents):
            pnodes[(pnode,pnode+step)]=[]
            p.append(pnode)
            pnode+=step

        # Put eache node on the scale
        for x in counts:
            p.append(counts[x][1])
            p.sort()
            i = p[p.index(counts[x][1])-1]
            pnodes[(i,i+step)].append(x)
            p.remove(counts[x][1])

        # Write the list of the scale nodes
        s.write('\n\n@ Percent: #label, shape\n\n')
        sci = {}
        for x in pnodes:
            if len(pnodes[x])>0:
            	idnode = str(x[0])+'_to_'+str(x[1])
                s.write(idnode+'; circle\n')
                sci[x[0]]=idnode

        # Makes links between 'percent' nodes to create a visual scale
        s.write('\n\n_ Scale\n\n')
        sci = sci.values()
        sci.sort(key = lambda w:w[0])
        for n in range(len(sci[:-1])):
            s.write(sci[n]+' -- '+sci[n+1]+'\n')

        # Write the data links of the histograph
        s.write('\n\n_ Distribution, percentage\n\n')
        for x in pnodes:
            for y in pnodes[x]:
                s.write(str(x[0])+'_to_'+str(x[1])+' -- '+y+'; '+str(counts[y][0])+' items and '+str(counts[y][1])+' pct\n')

        s.close()
        print 'The file '+fname+' is ready to be imported in framadap!'



    #def distrib(self,type1,type2,links):
    #	s1 = open(links+'_distrib_'+type1+'_to_'+type2+'.txt','w')
       #s2to1 = open(links+'_distrib_'+type2+'_to_'+type1+'.txt','w')
    #    s1to2.write('!;\n\n& '+self.urls[type1]+'\n& '+self.urls[type2]+'\n')
        #s2to1.write('!;\n\n& '+self.urls[type1]+'\n& '+self.urls[type2]+'\n\n')
    #    LinkType = '_ Distribution\n\n'
    #    self.checkOrder(type1,type2,links)
    #    s1.close()
        #s2tos1.close()

if __name__ == '__main__':
    h = Histograph(sys.argv[1])
    h.show()
    h.histo('Personne','Infraction','PersonInfraction')
    