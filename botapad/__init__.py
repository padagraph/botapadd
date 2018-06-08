# -*- coding: utf-8 -*-

try : 
    from botapad  import Botapad
except:    
    from .botapad  import Botapad



class BotapadError(Exception):
    pass
    
class BotapadPostError(Exception):
    def __init__(self, message, objs, row):
        self.message = message
        self.objs = objs
        self.row = row
    
class BotapadParseError(Exception):
    def __init__(self, path, message, line=""):
        self.path = path
        self.message = message
        self.line = line
        self.log = ""
        #print path, message, line
    
class BotapadCsvError(Exception):
    def __init__(self, path, separator, message):
        self.path = path
        self.separator = separator
        self.message = message
    
class BotapadURLError(Exception):
    def __init__(self, message, url):
        self.message = message
        self.url = url

